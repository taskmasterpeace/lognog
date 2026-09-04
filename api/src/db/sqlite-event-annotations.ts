import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';

export interface EventAnnotation {
  id: string;
  title: string;
  description: string | null;
  start_ts: string;
  end_ts: string | null;
  color: string | null;
  tags: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function getEventAnnotations(): EventAnnotation[] {
  return getSQLiteDB()
    .prepare('SELECT * FROM event_annotations ORDER BY start_ts DESC')
    .all() as EventAnnotation[];
}

export function getEventAnnotation(id: string): EventAnnotation | undefined {
  return getSQLiteDB().prepare('SELECT * FROM event_annotations WHERE id = ?').get(id) as
    | EventAnnotation
    | undefined;
}

/**
 * Annotations overlapping [earliest, latest] — for overlaying on a timechart.
 * A point annotation (end_ts NULL) overlaps if it falls inside the window; a
 * span overlaps if it starts before the window ends and ends after it begins.
 * Uses datetime() so a 'Z'/'T' separator variance can't skew the comparison.
 */
export function getEventAnnotationsInRange(earliest: string, latest: string): EventAnnotation[] {
  return getSQLiteDB()
    .prepare(
      `SELECT * FROM event_annotations
       WHERE datetime(replace(start_ts, 'Z', '')) <= datetime(replace(@latest, 'Z', ''))
       AND (
         (end_ts IS NULL AND datetime(replace(start_ts, 'Z', '')) >= datetime(replace(@earliest, 'Z', '')))
         OR (end_ts IS NOT NULL AND datetime(replace(end_ts, 'Z', '')) >= datetime(replace(@earliest, 'Z', '')))
       )
       ORDER BY start_ts ASC`,
    )
    .all({ earliest, latest }) as EventAnnotation[];
}

export function createEventAnnotation(a: {
  title: string;
  description?: string | null;
  start_ts: string;
  end_ts?: string | null;
  color?: string | null;
  tags?: string | null;
  created_by?: string | null;
}): EventAnnotation {
  const db = getSQLiteDB();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO event_annotations (id, title, description, start_ts, end_ts, color, tags, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    a.title,
    a.description ?? null,
    a.start_ts,
    a.end_ts ?? null,
    a.color ?? null,
    a.tags ?? null,
    a.created_by ?? null,
  );
  return getEventAnnotation(id)!;
}

export function updateEventAnnotation(
  id: string,
  updates: Partial<Pick<EventAnnotation, 'title' | 'description' | 'start_ts' | 'end_ts' | 'color' | 'tags'>>,
): EventAnnotation | undefined {
  const existing = getEventAnnotation(id);
  if (!existing) return undefined;
  const db = getSQLiteDB();
  db.prepare(
    `UPDATE event_annotations
     SET title = ?, description = ?, start_ts = ?, end_ts = ?, color = ?, tags = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    updates.title ?? existing.title,
    updates.description !== undefined ? updates.description : existing.description,
    updates.start_ts ?? existing.start_ts,
    updates.end_ts !== undefined ? updates.end_ts : existing.end_ts,
    updates.color !== undefined ? updates.color : existing.color,
    updates.tags !== undefined ? updates.tags : existing.tags,
    id,
  );
  return getEventAnnotation(id);
}

export function deleteEventAnnotation(id: string): boolean {
  return getSQLiteDB().prepare('DELETE FROM event_annotations WHERE id = ?').run(id).changes > 0;
}
