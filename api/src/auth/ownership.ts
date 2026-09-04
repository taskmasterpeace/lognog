import type { Request, Response } from 'express';

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
