/**
 * The API-key gate: runs in front of every API router (see routes/mount.ts).
 *
 * For a request that carries an API key (`Authorization: ApiKey <key>`, or
 * `X-API-Key` when there is no Authorization header, or `?api_key=` on the MCP
 * stream), it checks the key's own permissions against what the route needs
 * (auth/key-policy.ts) and answers 403 before the router runs if the key may
 * not do this.
 *
 * - Browser sessions (`Authorization: Bearer <jwt>`) pass straight through:
 *   JWT users are still authorized by role, unchanged.
 * - Requests with no key pass straight through: the route's own auth decides.
 * - An invalid / revoked / expired key passes through too, so the route
 *   answers exactly as before (401 from `authenticate`, anonymous for
 *   `optionalAuth`). The gate only ever narrows what a VALID key can do.
 * - A key that can't be checked at all (the lookup throws, e.g. a database
 *   error) gets a 500 here and never reaches the route: fail closed.
 *
 * The validated key is cached on the request, so `authenticate` /
 * `authenticateIngestion` don't bcrypt the same key a second time.
 */
import type { Request, Response, NextFunction } from 'express';
import { getUserById, logAuthEvent } from './auth.js';
import { decideApiKey, apiKeyNeed, normalizeKeyPath, permissionNameForNeed } from './key-policy.js';
import { resolveApiKeyCached } from './api-key-cache.js';
import { getSQLiteDB } from '../db/sqlite.js';

/**
 * One audit row per repeated refusal, not one per request.
 *
 * A machine that keeps asking for something its key may not do (the desktop
 * agent polling alert pop-ups with a send-logs-only key, every 30 seconds)
 * would otherwise write thousands of identical 'apikey_permission_denied'
 * rows a day, and nothing prunes auth_audit_log, so real refusals get buried.
 * The first refusal of a key + IP + method + path writes a row as before;
 * repeats within DENIAL_ROW_WINDOW_MS update that same row (details.repeats
 * and details.last_seen) instead, so no refusal goes uncounted. After the
 * window, or once the row is gone, the next refusal writes a fresh row.
 */
export const DENIAL_ROW_WINDOW_MS = 24 * 60 * 60 * 1000;
const DENIAL_ROW_MAX_TRACKED = 5000;
const recentDenialRows = new Map<string, { rowId: string; firstAt: number; repeats: number }>();

/** Test hook: forget the rows tracked so far. */
export function resetDenialRowsForTest(): void {
  recentDenialRows.clear();
}

function recordDenial(
  signature: string,
  write: () => string,
  now: number = Date.now(),
): void {
  const seen = recentDenialRows.get(signature);
  if (seen && now - seen.firstAt < DENIAL_ROW_WINDOW_MS) {
    seen.repeats += 1;
    const changed = getSQLiteDB()
      .prepare(
        "UPDATE auth_audit_log SET details = json_set(COALESCE(details, '{}'), '$.repeats', ?, '$.last_seen', ?) WHERE id = ?",
      )
      .run(seen.repeats, new Date(now).toISOString(), seen.rowId);
    if (changed.changes > 0) return;
    // The row is gone (cleared by an admin): start a new one below.
  }
  recentDenialRows.delete(signature);
  const rowId = write();
  recentDenialRows.set(signature, { rowId, firstAt: now, repeats: 0 });
  if (recentDenialRows.size > DENIAL_ROW_MAX_TRACKED) {
    // Forget the oldest; at worst its next refusal writes a new row.
    const oldest = recentDenialRows.keys().next().value;
    if (oldest !== undefined) recentDenialRows.delete(oldest);
  }
}

/** The API key this request presents, if any (never logged). */
export function presentedApiKey(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth) {
    return auth.startsWith('ApiKey ') ? auth.slice(7) : undefined;
  }
  const header = req.headers['x-api-key'];
  if (header) return Array.isArray(header) ? header[0] : header;
  if (normalizeKeyPath(req.path) === '/mcp/sse' && typeof req.query.api_key === 'string') return req.query.api_key;
  return undefined;
}

export async function apiKeyGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = presentedApiKey(req);
  if (!key) {
    next();
    return;
  }

  // Public routes: don't spend a bcrypt on a key the route ignores.
  if (apiKeyNeed(req.method, req.path) === 'none') {
    next();
    return;
  }

  let result;
  let user;
  try {
    result = await resolveApiKeyCached(req, key);
    user = result ? getUserById(result.userId) : undefined;
  } catch (err) {
    // Fail closed: if the key can't be checked (database error...), the
    // request must not reach a route whose own auth might still let it in.
    console.error('[api-key-gate] could not check an API key:', err instanceof Error ? err.message : 'unknown error');
    res.status(500).json({ error: 'Could not check the API key; try again' });
    return;
  }
  if (!result || !user || !user.is_active) {
    next();
    return;
  }

  const decision = decideApiKey(req.method, req.path, result.permissions, result.allowedIndexes);
  if (decision.allowed) {
    next();
    return;
  }

  const needed = permissionNameForNeed(decision.need);
  try {
    const signature = [result.keyId, req.ip ?? '', req.method.toUpperCase(), normalizeKeyPath(req.path)].join('|');
    recordDenial(signature, () =>
      logAuthEvent(user.id, 'apikey_permission_denied', req.ip, req.get('user-agent'), {
        method: req.method,
        path: req.path,
        needed,
        missing: decision.missing,
        apiKeyPermissions: result.permissions,
        scoped: !!(result.allowedIndexes && result.allowedIndexes.length > 0),
      }),
    );
  } catch {
    // The refusal stands even if the audit log can't be written.
  }
  res.status(403).json({
    error: 'API key lacks required permissions',
    needed,
    missing: decision.missing,
    message: decision.reason,
  });
}
