/**
 * Home is the first page after login: one failing query must not blank it
 * (critic 10-21 r2 #3). The apps query is made to throw; money still loads and
 * the page is told which part failed.
 */
import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LOGNOG_BACKEND = 'sqlite';
process.env.LOGS_DB_PATH = join(tmpdir(), `lognog-home-fail-${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}.db`);

vi.mock('../db/backend.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../db/backend.js')>();
  return {
    ...real,
    getBackend: () => 'sqlite' as const,
    executeRawQuery: vi.fn(async (sql: string) => {
      if (sql.includes('active_minutes')) throw new Error('apps query broke');
      if (sql.includes('AS last_at')) return [{ events: 0, last_at: null }];
      return [];
    }),
  };
});

import { getHomeSummary } from './home-summary.js';

describe('a failing Home query', () => {
  it('names the failed part and still loads the rest', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const home = await getHomeSummary({ nowMs: Date.UTC(2026, 9, 21, 15), allowedIndexes: ['uptime'] });
    expect(home.failed).toEqual(['apps']);
    expect(home.apps).toEqual([]);
    expect(home.needs_you).toEqual([]);
    expect(home.money.ai.status).toBe('none');
    expect(home.money.bank.status).toBe('not_visible');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('a failing money query says "failed", not "no events"', async () => {
    const backend = await import('../db/backend.js');
    vi.mocked(backend.executeRawQuery).mockImplementation(async (sql: string) => {
      if (sql.includes('active_minutes')) return [];
      throw new Error('money query broke');
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const home = await getHomeSummary({ nowMs: Date.UTC(2026, 9, 21, 15), allowedIndexes: ['uptime', 'money'] });
    expect(home.failed.sort()).toEqual(['ai', 'bank']);
    expect(home.money.bank.status).toBe('failed');
    expect(home.money.ai.status).toBe('failed');
    expect(home.apps).toEqual([]);
    err.mockRestore();
  });
});
