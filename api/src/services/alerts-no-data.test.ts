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
// insertLogs is stubbed so internal-logger (logAlertEvaluated) is a no-op and
// never touches ClickHouse / network during the test.
const mockExecuteDSLQuery = vi.fn();
vi.mock('../db/backend.js', () => ({
  executeDSLQuery: (...args: unknown[]) => mockExecuteDSLQuery(...args),
  getBackend: () => 'sqlite',
  isLiteMode: () => true,
  insertLogs: vi.fn().mockResolvedValue(undefined),
}));

import { testAlert, evaluateAlert } from './alerts.js';
import { createAlert } from '../db/sqlite-alerts.js';

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

// Drive evaluateAlert directly (not just testAlert): creates a real no_data
// alert row in the temp SQLite DB, mocks the search, and asserts the full
// evaluation path triggers on 0 results and does not on >0 results.
describe('no_data alert via evaluateAlert', () => {
  beforeEach(() => {
    mockExecuteDSLQuery.mockReset();
  });

  it('triggers when the search returns zero results', async () => {
    mockExecuteDSLQuery.mockResolvedValue({ sql: 'SELECT 1', results: [] });

    const alert = createAlert('no-data eval (zero)', 'search index=web', {
      trigger_type: 'no_data',
      time_range: '-15m',
      enabled: true,
      actions: [],
    });

    const result = await evaluateAlert(alert.id);

    expect(result.resultCount).toBe(0);
    expect(result.triggered).toBe(true);
  });

  it('does NOT trigger when the search returns results', async () => {
    mockExecuteDSLQuery.mockResolvedValue({
      sql: 'SELECT 1',
      results: [{ hostname: 'web-01' }, { hostname: 'web-02' }],
    });

    const alert = createAlert('no-data eval (some)', 'search index=web', {
      trigger_type: 'no_data',
      time_range: '-15m',
      enabled: true,
      actions: [],
    });

    const result = await evaluateAlert(alert.id);

    expect(result.resultCount).toBe(2);
    expect(result.triggered).toBe(false);
    expect(result.message).toBe('Condition not met');
  });
});
