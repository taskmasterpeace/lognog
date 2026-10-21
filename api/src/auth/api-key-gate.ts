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
 *
 * The validated key is cached on the request, so `authenticate` /
 * `authenticateIngestion` don't bcrypt the same key a second time.
 */
import type { Request, Response, NextFunction } from 'express';
import { getUserById, logAuthEvent } from './auth.js';
import { decideApiKey, apiKeyNeed, normalizeKeyPath } from './key-policy.js';
import { resolveApiKeyCached } from './api-key-cache.js';

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
  try {
    result = await resolveApiKeyCached(req, key);
  } catch {
    next(); // let the route's own auth produce its usual error
    return;
  }
  if (!result) {
    next();
    return;
  }
  const user = getUserById(result.userId);
  if (!user || !user.is_active) {
    next();
    return;
  }

  const decision = decideApiKey(req.method, req.path, result.permissions, result.allowedIndexes);
  if (decision.allowed) {
    next();
    return;
  }

  logAuthEvent(user.id, 'apikey_permission_denied', req.ip, req.get('user-agent'), {
    method: req.method,
    path: req.path,
    needed: decision.need,
    apiKeyPermissions: result.permissions,
    scoped: !!(result.allowedIndexes && result.allowedIndexes.length > 0),
  });
  res.status(403).json({
    error: 'API key lacks required permissions',
    needed: decision.need,
    message: decision.reason,
  });
}
