import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Force SQLite/Lite mode BEFORE importing the backend module (the module reads
// LOGNOG_BACKEND lazily via getBackend(), but set it early to be safe).
process.env.LOGNOG_BACKEND = 'sqlite';

// The logs table lives in its own DB keyed by LOGS_DB_PATH (default
// ./lognog-logs.db, which persists between runs). Give this file an isolated,
// unique logs DB so row counts are deterministic and not polluted by other runs.
process.env.LOGS_DB_PATH = join(
  tmpdir(),
  `lognog-logs-test-${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}.db`,
);

import { executeDSLQuery, insertLogs } from './backend';

describe('executeDSLQuery - read-side index scoping (SQLite/Lite)', () => {
  beforeAll(async () => {
    await insertLogs([
      { timestamp: new Date().toISOString(), hostname: 'a1', message: 'alpha one', index_name: 'alpha' },
      { timestamp: new Date().toISOString(), hostname: 'a2', message: 'alpha two', index_name: 'alpha' },
      { timestamp: new Date().toISOString(), hostname: 'b1', message: 'beta one', index_name: 'beta' },
    ]);
  });

  it('returns only allowed-index rows when scoped', async () => {
    const { results } = await executeDSLQuery<{ index_name: string }>('search *', {
      allowedIndexes: ['alpha'],
    });
    expect(results.length).toBe(2);
    expect(results.every(r => r.index_name === 'alpha')).toBe(true);
  });

  it('returns all rows when unscoped (undefined)', async () => {
    const { results } = await executeDSLQuery<{ index_name: string }>('search *', {});
    const indexes = new Set(results.map(r => r.index_name));
    expect(indexes.has('alpha')).toBe(true);
    expect(indexes.has('beta')).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('cannot be bypassed by querying a non-allowed index explicitly', async () => {
    const { results } = await executeDSLQuery<{ index_name: string }>('search index=beta', {
      allowedIndexes: ['alpha'],
    });
    expect(results.length).toBe(0);
  });

  it('matches allowed index case-insensitively', async () => {
    const { results } = await executeDSLQuery<{ index_name: string }>('search *', {
      allowedIndexes: ['ALPHA'],
    });
    expect(results.length).toBe(2);
  });
});
