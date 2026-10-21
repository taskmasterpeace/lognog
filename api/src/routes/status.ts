/**
 * GET /status/lights (served as /api/status/lights behind nginx)
 *
 * One green / yellow / red light per app, for the lab's round screens, the
 * /lights page and the spoken-red watcher. See services/lab-lights.ts for the
 * rule. Needs a login or an API key with the "read" permission; a key scoped
 * to some indexes only sees those apps.
 *
 *   ?apps=hyh,directors-palette   only these, in this order (max 20)
 */
import { Router, Request, Response } from 'express';
import { authenticate, requirePermission } from '../auth/middleware.js';
import { getLabLights } from '../services/lab-lights.js';

const router = Router();

export const MAX_APPS = 20;
const MAX_APP_NAME = 100;

/** "a, b,,c" -> ['a','b','c'] (deduped, order kept); a string error when the list is unusable. */
export function parseAppsParam(raw: unknown): string[] | undefined | { error: string } {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') return { error: 'apps must be one comma-separated list' };
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of raw.split(',')) {
    const name = part.trim();
    if (!name) continue;
    if (name.length > MAX_APP_NAME) return { error: `app names are at most ${MAX_APP_NAME} characters` };
    if (!/^[\w.\-: ]+$/.test(name)) return { error: `app name "${name.slice(0, 40)}" has characters an app name can't have` };
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  if (names.length > MAX_APPS) return { error: `at most ${MAX_APPS} apps at a time` };
  return names.length ? names : undefined;
}

router.get('/lights', authenticate, requirePermission('read'), async (req: Request, res: Response) => {
  const apps = parseAppsParam(req.query.apps);
  if (apps && !Array.isArray(apps)) {
    res.status(400).json({ error: apps.error });
    return;
  }
  try {
    const result = await getLabLights(req.allowedIndexes, apps);
    res.set('Cache-Control', 'no-store');
    res.json(result);
  } catch (err) {
    console.error('[status/lights] failed:', err instanceof Error ? err.message : err);
    res.status(503).json({ error: "Couldn't read the logs right now" });
  }
});

export default router;
