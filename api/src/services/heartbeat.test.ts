// api/src/services/heartbeat.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';

// Use an isolated on-disk temp DB so the module singleton in db/sqlite.ts is harmless.
const TEST_DB = './lognog-test-heartbeat.db';
process.env.SQLITE_PATH = TEST_DB;

import { getSQLiteDB } from '../db/sqlite.js';
import {
  recordHeartbeats,
  getStaleSources,
  listSources,
  initializeHeartbeatSchema,
  markSourceUnexpected,
} from './heartbeat.js';

function clearTable(): void {
  const db = getSQLiteDB();
  db.exec('DELETE FROM source_heartbeats');
}

// Helper to backdate a source's last_seen_at so it appears stale.
function backdateSource(sourceKey: string, minutesAgo: number): void {
  const db = getSQLiteDB();
  db.prepare(
    `UPDATE source_heartbeats SET last_seen_at = datetime('now', ?) WHERE source_key = ?`
  ).run(`-${minutesAgo} minutes`, sourceKey);
}

describe('heartbeat service', () => {
  beforeEach(() => {
    initializeHeartbeatSchema();
    clearTable();
  });

  afterAll(() => {
    try {
      fs.unlinkSync(TEST_DB);
    } catch {
      /* ignore */
    }
  });

  it('inserts a new row for an unseen source', () => {
    recordHeartbeats([{ index_name: 'web', hostname: 'host1' }]);

    const sources = listSources();
    expect(sources.length).toBe(1);
    expect(sources[0].source_key).toBe('web::host1');
    expect(sources[0].index_name).toBe('web');
    expect(sources[0].hostname).toBe('host1');
    expect(sources[0].event_count).toBe(1);
    expect(sources[0].expected).toBe(1);
    expect(sources[0].first_seen_at).toBeTruthy();
    expect(sources[0].last_seen_at).toBeTruthy();
  });

  it('defaults missing index_name to main and hostname to unknown', () => {
    recordHeartbeats([{}]);
    const sources = listSources();
    expect(sources.length).toBe(1);
    expect(sources[0].source_key).toBe('main::unknown');
    expect(sources[0].index_name).toBe('main');
    expect(sources[0].hostname).toBe('unknown');
  });

  it('increments event_count on repeat ingest and preserves first_seen_at', () => {
    recordHeartbeats([{ index_name: 'web', hostname: 'host1' }]);
    const firstSeen = listSources()[0].first_seen_at;

    recordHeartbeats([{ index_name: 'web', hostname: 'host1' }]);
    recordHeartbeats([{ index_name: 'web', hostname: 'host1' }]);

    const sources = listSources();
    expect(sources.length).toBe(1);
    expect(sources[0].event_count).toBe(3);
    expect(sources[0].first_seen_at).toBe(firstSeen);
  });

  it('dedupes within a batch and counts records per pair', () => {
    recordHeartbeats([
      { index_name: 'web', hostname: 'host1' },
      { index_name: 'web', hostname: 'host1' },
      { index_name: 'web', hostname: 'host2' },
    ]);

    const sources = listSources();
    expect(sources.length).toBe(2);
    const h1 = sources.find((s) => s.source_key === 'web::host1');
    const h2 = sources.find((s) => s.source_key === 'web::host2');
    expect(h1?.event_count).toBe(2);
    expect(h2?.event_count).toBe(1);
  });

  it('never throws on bad input', () => {
    // @ts-expect-error - intentionally passing invalid input
    expect(() => recordHeartbeats(null)).not.toThrow();
    // @ts-expect-error - intentionally passing invalid input
    expect(() => recordHeartbeats(undefined)).not.toThrow();
    expect(() => recordHeartbeats([])).not.toThrow();
  });

  it('getStaleSources returns only old AND expected rows', () => {
    recordHeartbeats([
      { index_name: 'web', hostname: 'stale-host' },
      { index_name: 'web', hostname: 'fresh-host' },
    ]);

    // Backdate one source by 30 minutes
    backdateSource('web::stale-host', 30);

    const stale = getStaleSources(15);
    expect(stale.length).toBe(1);
    expect(stale[0].source_key).toBe('web::stale-host');
  });

  it('getStaleSources excludes sources with expected = 0', () => {
    recordHeartbeats([{ index_name: 'web', hostname: 'stale-host' }]);
    backdateSource('web::stale-host', 30);

    const db = getSQLiteDB();
    db.prepare(`UPDATE source_heartbeats SET expected = 0 WHERE source_key = ?`).run('web::stale-host');

    const stale = getStaleSources(15);
    expect(stale.length).toBe(0);
  });

  it('recordHeartbeats resets stale_notified when a source is seen again', () => {
    recordHeartbeats([{ index_name: 'web', hostname: 'host1' }]);

    const db = getSQLiteDB();
    db.prepare(`UPDATE source_heartbeats SET stale_notified = 1 WHERE source_key = ?`).run('web::host1');

    // Sanity: it was set
    let row = db.prepare(`SELECT stale_notified FROM source_heartbeats WHERE source_key = ?`).get('web::host1') as { stale_notified: number };
    expect(row.stale_notified).toBe(1);

    // Seeing it again should reset stale_notified to 0
    recordHeartbeats([{ index_name: 'web', hostname: 'host1' }]);
    row = db.prepare(`SELECT stale_notified FROM source_heartbeats WHERE source_key = ?`).get('web::host1') as { stale_notified: number };
    expect(row.stale_notified).toBe(0);
  });

  it('markSourceUnexpected excludes a source from getStaleSources even when old', () => {
    // LogNog's own internal source goes stale...
    recordHeartbeats([{ index_name: 'main', hostname: 'lognog-api' }]);
    backdateSource('main::lognog-api', 30);

    // Sanity: it WOULD be reported as stale while still expected.
    expect(getStaleSources(15).map((s) => s.source_key)).toContain('main::lognog-api');

    // Mark it unexpected (as the scheduler does after the synthetic insert).
    markSourceUnexpected('main', 'lognog-api');

    const db = getSQLiteDB();
    const row = db
      .prepare(`SELECT expected FROM source_heartbeats WHERE source_key = ?`)
      .get('main::lognog-api') as { expected: number };
    expect(row.expected).toBe(0);

    // Now excluded from stale sweep regardless of age.
    expect(getStaleSources(15).map((s) => s.source_key)).not.toContain('main::lognog-api');
  });

  it('markSourceUnexpected never throws for an unknown source', () => {
    expect(() => markSourceUnexpected('nope', 'nobody')).not.toThrow();
  });

  it('listSources returns newest-last_seen first', () => {
    recordHeartbeats([{ index_name: 'web', hostname: 'old' }]);
    backdateSource('web::old', 60);
    recordHeartbeats([{ index_name: 'web', hostname: 'new' }]);

    const sources = listSources();
    expect(sources[0].source_key).toBe('web::new');
    expect(sources[1].source_key).toBe('web::old');
  });
});
