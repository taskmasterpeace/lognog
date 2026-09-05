import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Force SQLite/Lite mode BEFORE importing the backend module.
process.env.LOGNOG_BACKEND = 'sqlite';
process.env.LOGS_DB_PATH = join(
  tmpdir(),
  `lognog-dslfeatures-test-${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}.db`,
);

import { insertLogs, executeDSLQuery } from './backend';
import { setLookupTable, getLookupTable, removeLookupTable } from '../services/lookup-tables';

/**
 * End-to-end backend tests (real SQLite) for the execution-level parity
 * features: append, inputlookup, outputlookup, and top-BY per-group ranking.
 */
describe('DSL backend features (SQLite/Lite, real DB)', () => {
  beforeAll(async () => {
    const base = (hostname: string, status: string) => ({
      timestamp: new Date().toISOString(),
      hostname,
      app_name: 'web',
      message: `${hostname} ${status}`,
      index_name: 'app',
      structured_data: JSON.stringify({ status_code: status }),
    });
    await insertLogs([
      base('web-1', '200'),
      base('web-1', '404'),
      base('web-1', '404'),
      base('db-1', '500'),
      base('db-1', '200'),
    ]);
  });

  it('append: unions the main search with the subsearch', async () => {
    const { results } = await executeDSLQuery<Record<string, unknown>>(
      'search hostname=web-1 | append [ search hostname=db-1 ]',
    );
    expect(results.length).toBe(5);
    const hosts = new Set(results.map(r => r.hostname));
    expect(hosts.has('web-1')).toBe(true);
    expect(hosts.has('db-1')).toBe(true);
  });

  it('top N field by group: per-group top-N (window/LIMIT BY)', async () => {
    const { results } = await executeDSLQuery<Record<string, unknown>>(
      'search * | top 1 status_code by hostname',
    );
    // One row per host (top 1 each).
    expect(results.length).toBe(2);
    const web = results.find(r => r.hostname === 'web-1');
    expect(web).toBeTruthy();
    expect(String(web!.status_code)).toBe('404'); // 404 appears twice for web-1
    expect(Number(web!.count)).toBe(2);
  });

  it('outputlookup then inputlookup round-trips the rows (keyed by first field)', async () => {
    removeLookupTable('e2e_hosts');
    // dedup so the rows have distinct hostnames (a lookup table is keyed on its
    // first field — one row per key).
    await executeDSLQuery('search * | dedup hostname | table hostname, app_name | outputlookup e2e_hosts');
    expect(getLookupTable('e2e_hosts')).toBeTruthy();

    const { results } = await executeDSLQuery<Record<string, unknown>>('inputlookup e2e_hosts');
    expect(results.length).toBe(2); // web-1, db-1
    const hosts = new Set(results.map(r => r.hostname));
    expect(hosts.has('web-1')).toBe(true);
    expect(hosts.has('db-1')).toBe(true);
  });

  it('inputlookup as a data source, filtered downstream', async () => {
    setLookupTable('watchlist', 'test', 'user', [
      { key: 'alice', values: { role: 'admin' } },
      { key: 'bob', values: { role: 'user' } },
      { key: 'carol', values: { role: 'admin' } },
    ]);
    const { results } = await executeDSLQuery<Record<string, unknown>>(
      'inputlookup watchlist | search role=admin',
    );
    expect(results.length).toBe(2);
    const users = new Set(results.map(r => r.user));
    expect(users.has('alice')).toBe(true);
    expect(users.has('carol')).toBe(true);
    expect(users.has('bob')).toBe(false);
  });
});
