/**
 * Heartbeat / Presence Tracking Service
 *
 * Phase 3: "Tell me when an entity goes silent" capability.
 *
 * DESIGN PRINCIPLE — must be cheap, not system-intensive:
 * We do NOT detect silence by running per-entity searches over log data.
 * Instead we TRACK PRESENCE cheaply: maintain a tiny `source_heartbeats`
 * table (one row per source, updated on ingest), then a single periodic
 * sweep reads that small table. Cost is O(sources), never scans logs.
 *
 * A "source" is identified by `${index_name}::${hostname}`.
 */

import { getSQLiteDB } from '../db/sqlite.js';

export interface SourceHeartbeat {
  source_key: string;        // `${index_name}::${hostname}`
  index_name: string;
  hostname: string | null;
  last_seen_at: string;      // ISO/SQLite datetime
  first_seen_at: string;
  event_count: number;
  expected: number;          // 1 = alert if it goes silent
  stale_notified: number;    // 1 = we already warned about this stale source
}

let schemaInitialized = false;

/**
 * Initialize the heartbeat table. Idempotent. Follows the pattern of
 * initializeAuthSchema in src/auth/auth.ts (CREATE TABLE IF NOT EXISTS).
 */
export function initializeHeartbeatSchema(): void {
  const db = getSQLiteDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS source_heartbeats (
      source_key TEXT PRIMARY KEY,      -- \`\${index_name}::\${hostname}\`
      index_name TEXT NOT NULL,
      hostname TEXT,
      last_seen_at TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      event_count INTEGER NOT NULL DEFAULT 0,
      expected INTEGER NOT NULL DEFAULT 1  -- 1 = alert if it goes silent
    );

    CREATE INDEX IF NOT EXISTS idx_source_heartbeats_last_seen ON source_heartbeats(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_source_heartbeats_expected ON source_heartbeats(expected);
  `);

  // Idempotent migration: add stale_notified column if it doesn't exist
  // (matches the Phase 1 ALTER pattern in db/sqlite.ts).
  const columns = db.pragma('table_info(source_heartbeats)') as Array<{ name: string }>;
  const columnNames = columns.map((c) => c.name);
  if (!columnNames.includes('stale_notified')) {
    db.exec('ALTER TABLE source_heartbeats ADD COLUMN stale_notified INTEGER NOT NULL DEFAULT 0');
  }

  schemaInitialized = true;
}

function ensureSchema(): void {
  if (!schemaInitialized) {
    initializeHeartbeatSchema();
  }
}

/**
 * Record presence for a batch of logs. Derives distinct
 * (index_name||'main', hostname||'unknown') pairs from the batch and UPSERTs
 * each: set last_seen_at = now, increment event_count by the number of
 * records for that pair, set first_seen_at on insert, and reset stale_notified
 * to 0 (the source is alive again).
 *
 * DEFENSIVE: wrapped so a failure never throws to the caller (ingestion path).
 */
export function recordHeartbeats(
  logs: Array<{ index_name?: string; hostname?: string }>
): void {
  try {
    if (!Array.isArray(logs) || logs.length === 0) return;

    ensureSchema();

    // Aggregate counts per source within this batch (dedupe).
    const counts = new Map<string, { index_name: string; hostname: string; count: number }>();
    for (const log of logs) {
      if (!log || typeof log !== 'object') continue;
      const indexName = (typeof log.index_name === 'string' && log.index_name) || 'main';
      const hostname = (typeof log.hostname === 'string' && log.hostname) || 'unknown';
      const key = `${indexName}::${hostname}`;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { index_name: indexName, hostname, count: 1 });
      }
    }

    if (counts.size === 0) return;

    const db = getSQLiteDB();

    const upsert = db.prepare(`
      INSERT INTO source_heartbeats
        (source_key, index_name, hostname, last_seen_at, first_seen_at, event_count, expected, stale_notified)
      VALUES
        (@source_key, @index_name, @hostname, datetime('now'), datetime('now'), @count, 1, 0)
      ON CONFLICT(source_key) DO UPDATE SET
        last_seen_at = datetime('now'),
        event_count = event_count + @count,
        stale_notified = 0
    `);

    const tx = db.transaction((rows: Array<{ source_key: string; index_name: string; hostname: string; count: number }>) => {
      for (const row of rows) {
        upsert.run(row);
      }
    });

    const rows = Array.from(counts.entries()).map(([source_key, v]) => ({
      source_key,
      index_name: v.index_name,
      hostname: v.hostname,
      count: v.count,
    }));

    tx(rows);
  } catch (error) {
    // NEVER throw to the caller — heartbeat tracking must not break ingestion.
    console.warn('[Heartbeat] recordHeartbeats failed:', error);
  }
}

/**
 * Return sources that are expected but have gone silent for at least
 * `thresholdMinutes`. O(sources) — reads the tiny heartbeat table only.
 */
export function getStaleSources(thresholdMinutes: number): SourceHeartbeat[] {
  ensureSchema();
  const db = getSQLiteDB();
  return db.prepare(`
    SELECT source_key, index_name, hostname, last_seen_at, first_seen_at, event_count, expected, stale_notified
    FROM source_heartbeats
    WHERE expected = 1
      AND last_seen_at < datetime('now', ?)
    ORDER BY last_seen_at ASC
  `).all(`-${thresholdMinutes} minutes`) as SourceHeartbeat[];
}

/**
 * Return all known sources, newest-last_seen first.
 */
export function listSources(): SourceHeartbeat[] {
  ensureSchema();
  const db = getSQLiteDB();
  return db.prepare(`
    SELECT source_key, index_name, hostname, last_seen_at, first_seen_at, event_count, expected, stale_notified
    FROM source_heartbeats
    ORDER BY last_seen_at DESC
  `).all() as SourceHeartbeat[];
}

/**
 * Mark a source as already-notified (so the scheduler only warns once per
 * silence period). Used by the scheduler sweep.
 */
export function markStaleNotified(sourceKey: string): void {
  try {
    ensureSchema();
    const db = getSQLiteDB();
    db.prepare(`UPDATE source_heartbeats SET stale_notified = 1 WHERE source_key = ?`).run(sourceKey);
  } catch (error) {
    console.warn('[Heartbeat] markStaleNotified failed:', error);
  }
}

// Initialize schema on import (mirrors initializeAuthSchema usage pattern).
try {
  initializeHeartbeatSchema();
} catch {
  // DB may not be ready at import time in some contexts; ensureSchema covers it.
}
