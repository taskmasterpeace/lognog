/**
 * Tests for the `no_data` alert trigger type (Phase 3 heartbeat / silence).
 *
 * A `no_data` alert fires when its search returns NOTHING in the window —
 * a per-query "this stream went silent" alarm.
 *
 * We exercise the logic through `testAlert`, which compiles + runs the search
 * via executeDSLQuery. We mock the backend so we control resultCount.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Isolated temp DB for any incidental SQLite access during import.
process.env.SQLITE_PATH = './lognog-test-no-data.db';

// Mock the DB backend so executeDSLQuery returns a controllable result set.
const mockExecuteDSLQuery = vi.fn();
vi.mock('../db/backend.js', () => ({
  executeDSLQuery: (...args: unknown[]) => mockExecuteDSLQuery(...args),
  getBackend: () => 'sqlite',
}));

import { testAlert } from './alerts.js';

describe('no_data alert trigger', () => {
  beforeEach(() => {
    mockExecuteDSLQuery.mockReset();
  });

  it('triggers when the search returns zero results', async () => {
    mockExecuteDSLQuery.mockResolvedValue({ sql: 'SELECT 1', results: [] });

    const result = await testAlert(
      'search index=web',
      'no_data',
      'greater_than', // condition is ignored for no_data
      0,
      '-15m'
    );

    expect(result.resultCount).toBe(0);
    expect(result.wouldTrigger).toBe(true);
  });

  it('does NOT trigger when the search returns results', async () => {
    mockExecuteDSLQuery.mockResolvedValue({
      sql: 'SELECT 1',
      results: [{ hostname: 'web-01' }, { hostname: 'web-02' }],
    });

    const result = await testAlert(
      'search index=web',
      'no_data',
      'greater_than',
      0,
      '-15m'
    );

    expect(result.resultCount).toBe(2);
    expect(result.wouldTrigger).toBe(false);
  });
});
