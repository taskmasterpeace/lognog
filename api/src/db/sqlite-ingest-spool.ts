/**
 * Ingest spool: batches that could not be written to the log store (ClickHouse
 * down, network blip) are parked here and replayed once it is back, so a
 * client's POST never turns into silent data loss. Kept in the metadata
 * SQLite DB, which stays writable through a ClickHouse outage.
 */

import { getSQLiteDB } from './sqlite.js';

// Hard cap so a multi-day outage cannot fill the disk; beyond it the oldest
// batches are dropped (and counted) rather than refusing new ingest.
export const MAX_SPOOL_BATCHES = 20_000;

export interface SpooledBatch {
  id: number;
  payload: string;
  count: number;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

export function spoolBatch(logs: Record<string, unknown>[], error: string): { spooledId: number; dropped: number } {
  const database = getSQLiteDB();
  const insert = database.prepare(`
    INSERT INTO ingest_spool (payload, count, created_at, attempts, last_error)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0, ?)
  `);
  const result = insert.run(JSON.stringify(logs), logs.length, error.slice(0, 500));

  let dropped = 0;
  const total = (database.prepare('SELECT COUNT(*) AS c FROM ingest_spool').get() as { c: number }).c;
  if (total > MAX_SPOOL_BATCHES) {
    dropped = database.prepare(`
      DELETE FROM ingest_spool WHERE id IN (
        SELECT id FROM ingest_spool ORDER BY id ASC LIMIT ?
      )
    `).run(total - MAX_SPOOL_BATCHES).changes;
  }
  return { spooledId: Number(result.lastInsertRowid), dropped };
}

export function takeSpooledBatches(limit: number): SpooledBatch[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM ingest_spool ORDER BY id ASC LIMIT ?').all(limit) as SpooledBatch[];
}

export function deleteSpooledBatch(id: number): void {
  getSQLiteDB().prepare('DELETE FROM ingest_spool WHERE id = ?').run(id);
}

export function markSpoolAttempt(id: number, error: string): void {
  getSQLiteDB()
    .prepare('UPDATE ingest_spool SET attempts = attempts + 1, last_error = ? WHERE id = ?')
    .run(error.slice(0, 500), id);
}

export function spoolStats(): { batches: number; events: number; oldest: string | null } {
  const row = getSQLiteDB()
    .prepare('SELECT COUNT(*) AS batches, COALESCE(SUM(count), 0) AS events, MIN(created_at) AS oldest FROM ingest_spool')
    .get() as { batches: number; events: number; oldest: string | null };
  return { batches: row.batches, events: row.events, oldest: row.oldest };
}
