/**
 * per-result triggering with per-field throttling.
 *
 * A per_result alert fires once per result row, suppressing repeats for the
 * same throttle-field value(s) inside the throttle window, so a noisy host
 * can't drown out a new one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SQLITE_PATH = './lognog-test-per-result.db';

const mockExecuteDSLQuery = vi.fn();
vi.mock('../db/backend.js', () => ({
  executeDSLQuery: (...args: unknown[]) => mockExecuteDSLQuery(...args),
  getBackend: () => 'sqlite',
  isLiteMode: () => true,
  insertLogs: vi.fn().mockResolvedValue(undefined),
}));

import { evaluateAlert } from './alerts.js';
import { createAlert, getAlertHistory, getAlert } from '../db/sqlite-alerts.js';

describe('per-result alerts', () => {
  beforeEach(() => mockExecuteDSLQuery.mockReset());

  it('fires once per result and throttles repeats per field value', async () => {
    const alert = createAlert('disk per host', 'search disk_pct>90 | stats max(disk_pct) as disk_pct by hostname', {
      trigger_type: 'number_of_results',
      trigger_condition: 'greater_than',
      trigger_threshold: 0,
      trigger_mode: 'per_result',
      throttle_enabled: true,
      throttle_window_seconds: 3600,
      throttle_fields: 'hostname',
      actions: [{ type: 'log', config: {} }],
    });

    mockExecuteDSLQuery.mockResolvedValue({
      sql: 'SELECT 1',
      results: [{ hostname: 'web-01', disk_pct: 95 }, { hostname: 'web-02', disk_pct: 97 }],
    });
    const first = await evaluateAlert(alert.id);
    expect(first.triggered).toBe(true);
    expect(first.message).toMatch(/2 of 2 results fired/);
    expect(getAlertHistory(alert.id)).toHaveLength(2);
    expect(getAlert(alert.id)?.trigger_count).toBe(2);

    // web-01 again (throttled) + a brand-new host (fires)
    mockExecuteDSLQuery.mockResolvedValue({
      sql: 'SELECT 1',
      results: [{ hostname: 'web-01', disk_pct: 96 }, { hostname: 'db-01', disk_pct: 99 }],
    });
    const second = await evaluateAlert(alert.id);
    expect(second.triggered).toBe(true);
    expect(second.message).toMatch(/1 of 2 results fired/);
    const history = getAlertHistory(alert.id);
    expect(history).toHaveLength(3);
    expect(JSON.parse(history[0].sample_results || '[]')[0].hostname).toBe('db-01');

    // Everything already fired within the window → throttled, not an error.
    const third = await evaluateAlert(alert.id);
    expect(third.triggered).toBe(false);
    expect(third.message).toMatch(/throttled/i);
  });

  it('disables itself after max_triggers fires (fire-once)', async () => {
    const alert = createAlert('fire once', 'search severity<=2', {
      trigger_type: 'number_of_results',
      trigger_condition: 'greater_than',
      trigger_threshold: 0,
      max_triggers: 1,
      actions: [{ type: 'log', config: {} }],
    });
    mockExecuteDSLQuery.mockResolvedValue({ sql: 'SELECT 1', results: [{ hostname: 'web-01' }] });

    const first = await evaluateAlert(alert.id);
    expect(first.triggered).toBe(true);
    expect(getAlert(alert.id)?.enabled).toBe(0);

    const second = await evaluateAlert(alert.id);
    expect(second.triggered).toBe(false);
    expect(second.message).toMatch(/disabled/i);
  });

  it('keeps the classic once-per-alert behaviour by default', async () => {
    const alert = createAlert('errors', 'search severity<=3', {
      trigger_type: 'number_of_results',
      trigger_condition: 'greater_than',
      trigger_threshold: 0,
      actions: [{ type: 'log', config: {} }],
    });
    mockExecuteDSLQuery.mockResolvedValue({
      sql: 'SELECT 1',
      results: [{ hostname: 'web-01' }, { hostname: 'web-02' }, { hostname: 'web-03' }],
    });
    const result = await evaluateAlert(alert.id);
    expect(result.triggered).toBe(true);
    expect(getAlertHistory(alert.id)).toHaveLength(1);
    expect(getAlertHistory(alert.id)[0].result_count).toBe(3);
  });
});
