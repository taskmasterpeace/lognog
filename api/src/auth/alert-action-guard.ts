/**
 * Guards for alert ACTIONS (what an alert does when it fires).
 *
 * Two things live here because every route that reads or writes alerts needs
 * them, and they used to be checked in one handler and missed in others:
 *
 * 1. Script actions run a shell command on the API host. Only an admin may
 *    attach one, change an alert that has one, or make it run. For an API key
 *    that means the KEY must carry 'admin' (or '*'): the owner's role alone is
 *    not enough, because every key belongs to a user who is usually the admin.
 *
 * 2. Action settings carry secrets (webhook URLs and headers, Apprise URLs,
 *    e-mail addresses, script commands). An API key without 'admin' sees them
 *    as HIDDEN. When such a key sends an alert back (GET, edit, PUT), each
 *    HIDDEN value is put back from the stored alert, so a round trip never
 *    wipes a webhook. Browser (JWT) sessions are unchanged.
 */
import type { Request } from 'express';
import type { AlertAction } from '../db/sqlite.js';
import { keyHasNeed } from './key-policy.js';
import { safeJsonParse } from '../utils/json.js';

/** What a non-admin API key sees in place of a secret action setting. */
export const HIDDEN = '[hidden]';

/** Action settings that never hold a secret and stay visible to every key. */
const PLAIN_CONFIG_KEYS = new Set(['method', 'format', 'project', 'telegram', 'lab', 'urgent', 'channel', 'expires_in']);

/** True for browser sessions and for API keys that carry 'admin' (or '*'). */
export function isAdminGrade(req: Request): boolean {
  if (req.authMethod !== 'apikey') return true;
  return keyHasNeed(req.apiKeyPermissions, 'admin');
}

/** Admin user AND (browser session or admin key). */
export function mayUseScripts(req: Request): boolean {
  return req.user?.role === 'admin' && isAdminGrade(req);
}

function hasScript(actions: unknown): boolean {
  return Array.isArray(actions) && actions.some((a) => !!a && typeof a === 'object' && (a as AlertAction).type === 'script');
}

/**
 * Refuse a request that would attach a script action unless the caller may
 * use scripts. Returns the error message, or null when allowed.
 */
export function scriptActionForbidden(req: Request, actions: unknown): string | null {
  if (!hasScript(actions) || mayUseScripts(req)) return null;
  if (req.authMethod === 'apikey') {
    return "Script actions run commands on the server, so only an API key with the 'admin' permission can attach one";
  }
  return 'Only administrators can attach script actions to alerts';
}

/**
 * Refuse any change to (or manual run of) an alert that already has a script
 * action unless the caller may use scripts. Returns the error, or null.
 */
export function scriptAlertLocked(req: Request, existing: { actions?: string | null } | undefined): string | null {
  if (!existing) return null;
  const actions = safeJsonParse<AlertAction[]>(existing.actions ?? '[]', []);
  if (!hasScript(actions) || mayUseScripts(req)) return null;
  return "This alert runs a script on the server, so only an admin (or an API key with the 'admin' permission) can change or run it";
}

/** Hide secret action settings for a caller that is not admin-grade. */
export function presentActions(req: Request, actions: AlertAction[]): AlertAction[] {
  if (isAdminGrade(req) || !Array.isArray(actions)) return actions;
  return actions.map((a) => {
    if (!a || typeof a !== 'object') return a;
    const config = (a.config && typeof a.config === 'object' ? a.config : {}) as Record<string, unknown>;
    const shown: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config)) {
      shown[k] = PLAIN_CONFIG_KEYS.has(k) || v === undefined || v === null || v === '' ? v : HIDDEN;
    }
    return { ...a, config: shown as AlertAction['config'] };
  });
}

/**
 * The results of the actions an alert ran (alert history). Their messages
 * name the webhook URL, e-mail address or script output, so a caller that is
 * not admin-grade sees only the type and whether it worked.
 */
export function presentActionResults(req: Request, results: unknown): unknown {
  if (isAdminGrade(req) || !Array.isArray(results)) return results;
  return results.map((r) =>
    r && typeof r === 'object' ? { ...(r as Record<string, unknown>), message: HIDDEN } : r,
  );
}

/**
 * Put the stored value back wherever a caller sent HIDDEN (it read the alert
 * through a non-admin key and is sending it back).
 *
 * The stored value comes only from the stored action at the SAME position with
 * the SAME type. An action that keeps any hidden value must keep all of its
 * secret settings hidden: otherwise a key could point a webhook at its own
 * server while keeping the stored auth headers, and the next alert would hand
 * those headers to it.
 *
 * Returns the restored list, or an error explaining what to send instead.
 */
export function restoreHiddenActions(
  incoming: unknown,
  storedActionsJson: string | null | undefined,
): { actions: unknown } | { error: string } {
  if (!Array.isArray(incoming)) return { actions: incoming };
  const stored = safeJsonParse<AlertAction[]>(storedActionsJson ?? '[]', []);
  const out: unknown[] = [];
  for (let i = 0; i < incoming.length; i++) {
    const a = incoming[i] as AlertAction | null;
    if (!a || typeof a !== 'object' || !a.config || typeof a.config !== 'object') {
      out.push(a);
      continue;
    }
    const config: Record<string, unknown> = { ...(a.config as Record<string, unknown>) };
    const secretKeys = Object.keys(config).filter((k) => !PLAIN_CONFIG_KEYS.has(k));
    const hiddenKeys = secretKeys.filter((k) => config[k] === HIDDEN);
    if (hiddenKeys.length === 0) {
      out.push(a);
      continue;
    }
    const source = stored[i] && stored[i].type === a.type ? (stored[i].config as Record<string, unknown>) : undefined;
    if (!source) {
      return { error: `Action ${i + 1} (${a.type}) sends "${HIDDEN}" but there is no saved ${a.type} action in that place to keep; send the real values` };
    }
    const changed = secretKeys.filter((k) => config[k] !== HIDDEN && config[k] !== undefined && config[k] !== null && config[k] !== '');
    if (changed.length > 0) {
      return {
        error: `Action ${i + 1} (${a.type}) keeps some hidden settings but changes ${changed.join(', ')}; either keep all of its hidden settings or send all of them new`,
      };
    }
    for (const k of hiddenKeys) {
      if (source[k] === undefined) {
        return { error: `Action ${i + 1} (${a.type}) sends "${HIDDEN}" for "${k}" but there is no saved value to keep` };
      }
      config[k] = source[k];
    }
    // The stored secrets the caller did not mention stay as they were.
    for (const [k, v] of Object.entries(source)) {
      if (!PLAIN_CONFIG_KEYS.has(k) && !(k in config)) config[k] = v;
    }
    out.push({ ...a, config });
  }
  return { actions: out };
}
