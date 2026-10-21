/**
 * A failed alert action writes one searchable internal LogNog event
 * ("alert.action_failed") per failed action per run, carrying the alert
 * name, the action type and the reason. Successful actions keep their
 * existing "alert.action_sent" event.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

process.env.SQLITE_PATH = ':memory:';
delete process.env.LOGNOG_SELF_MONITORING;

const mockExecuteDSLQuery = vi.fn();
const mockInsertLogs = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/backend.js', () => ({
  executeDSLQuery: (...args: unknown[]) => mockExecuteDSLQuery(...args),
  getBackend: () => 'sqlite',
  isLiteMode: () => true,
  insertLogs: (...args: unknown[]) => mockInsertLogs(...args),
}));

import { evaluateAlert } from './alerts.js';
import { shutdown } from './internal-logger.js';
import { createAlert } from '../db/sqlite-alerts.js';
import { setSystemSetting } from '../db/sqlite-settings.js';

type Logged = { action: string; message: string; severity: number; success: boolean; structured_data: string };

function loggedEvents(): Logged[] {
  return mockInsertLogs.mock.calls.flatMap(call => call[0] as Logged[]);
}

describe('alert.action_failed internal event', () => {
  beforeAll(() => {
    // Self-monitoring with the shipped default level (WARNING) and categories.
    setSystemSetting('internal_logging_enabled', 'true');
  });

  it('writes exactly one event per failed action per run, with name, type and reason', async () => {
    mockExecuteDSLQuery.mockResolvedValue({ sql: 'SELECT 1', results: [{ message: 'boom' }] });
    const alert = createAlert('Disk full on web-01', 'search message="boom"', {
      trigger_type: 'number_of_results',
      trigger_condition: 'greater_than',
      trigger_threshold: 0,
      time_range: '-5m',
      enabled: true,
      throttle_enabled: false,
      actions: [
        { type: 'apprise', config: { channel: 'slack-alerts' } },
        { type: 'log', config: {} },
      ],
    });

    const first = await evaluateAlert(alert.id);
    expect(first.triggered).toBe(true);
    await shutdown();

    let failed = loggedEvents().filter(e => e.action === 'alert.action_failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].message).toBe(
      'Alert action failed: "Disk full on web-01" apprise: Notification channel "slack-alerts" not found',
    );
    expect(failed[0].success).toBe(false);
    expect(JSON.parse(failed[0].structured_data).details).toEqual({
      alert_id: alert.id,
      alert_name: 'Disk full on web-01',
      action_type: 'apprise',
      reason: 'Notification channel "slack-alerts" not found',
    });

    // A second run writes a second event, not more than one.
    await evaluateAlert(alert.id);
    await shutdown();
    failed = loggedEvents().filter(e => e.action === 'alert.action_failed');
    expect(failed).toHaveLength(2);
  });
});
