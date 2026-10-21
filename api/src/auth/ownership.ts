import type { Request, Response } from 'express';
import { keyHasNeed } from './key-policy.js';

/**
 * Ownership gate for team objects (alerts, reports, dashboards).
 *
 * Reads stay open to every authenticated user — these are shared operational
 * objects, as in app-level sharing. Mutations (edit, delete, toggle,
 * run, share) are limited to the owner or an admin. Rows created before
 * ownership existed have no owner and remain editable by everyone.
 *
 * Returns true when allowed; otherwise writes the 403 and returns false.
 */
export function requireOwnerOrAdmin(
  req: Request,
  res: Response,
  row: { owner_id?: string | null } | undefined,
  what: string
): boolean {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
  if (user.role === 'admin') return true;
  if (!row?.owner_id || row.owner_id === user.id) return true;
  res.status(403).json({ error: `Only the owner of this ${what} (or an admin) can change it` });
  return false;
}

/** Decorate a row with `is_owner` for the UI. */
export function withOwnership<T extends { owner_id?: string | null }>(req: Request, row: T): T & { is_owner: boolean } {
  const user = req.user;
  const is_owner = !!user && (user.role === 'admin' || !row.owner_id || row.owner_id === user.id);
  return { ...row, is_owner };
}

/**
 * A dashboard shared by public link runs its panel queries for anyone, over
 * every index. An API key without 'admin' may not change what it shows (on
 * any route that adds to or edits it). Returns the error, or null.
 */
export function sharedDashboardLocked(req: Request, dashboard: { is_public?: unknown } | undefined): string | null {
  if (!dashboard || !dashboard.is_public) return null;
  if (req.authMethod !== 'apikey' || keyHasNeed(req.apiKeyPermissions, 'admin')) return null;
  return "This dashboard is shared by a public link, so only an API key with the 'admin' permission can change it";
}
