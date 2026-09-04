/**
 * Custom trigger conditions: a bare DSL condition evaluated over the search
 * results (a "custom" trigger / secondary search). Previously
 * `custom_condition` just meant "any results".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.SQLITE_PATH = './lognog-test-custom-condition.db';

const mockExecuteDSLQuery = vi.fn();
vi.mock('../db/backend.js', async () => {
  const actual = await vi.importActual<typeof import('../db/backend.js')>('../db/backend.js');
  return {
    ...actual,
    executeDSLQuery: (...args: unknown[]) => mockExecuteDSLQuery(...args),
    getBackend: () => 'sqlite',
    isLiteMode: () => true,
    insertLogs: vi.fn().mockResolvedValue(undefined),
  };
});

import { evaluateAlert, testAlert } from './alerts.js';
import { filterRowsByDslCondition, validateDslCondition } from '../db/backend.js';
import { createAlert, getAlertHistory } from '../db/sqlite-alerts.js';

describe('DSL condition helpers', () => {
  it('filters rows with comparisons, AND/OR and quoted values', () => {
    const rows = [
      { hostname: 'web-01', count: 150 },
      { hostname: 'web-02', count: 20 },
      { hostname: 'db-01', count: 500 },
    ];
    expect(filterRowsByDslCondition(rows, 'count > 100').map(r => r.hostname)).toEqual(['web-01', 'db-01']);
    expect(filterRowsByDslCondition(rows, 'count > 100 AND hostname="web-01"').map(r => r.hostname)).toEqual(['web-01']);
    expect(filterRowsByDslCondition(rows, 'hostname=web-02 OR count>=500').map(r => r.hostname)).toEqual(['web-02', 'db-01']);
  });

  it('reports unparseable conditions', () => {
    expect(validateDslCondition('count > 100')).toBeNull();
    expect(validateDslCondition('')).toMatch(/empty/i);
    expect(validateDslCondition('(count > 1')).toBeTruthy();
  });
});

describe('custom_condition alerts', () => {
  beforeEach(() => mockExecuteDSLQuery.mockReset());

  it('fires only when a row satisfies the condition, and passes the matching rows to actions', async () => {
    const alert = createAlert('big hosts', 'search * | stats count by hostname', {
      trigger_type: 'custom_condition',
      custom_condition: 'count > 100',
      actions: [{ type: 'log', config: {} }],
    });

    mockExecuteDSLQuery.mockResolvedValue({
      sql: 'SELECT 1',
      results: [{ hostname: 'web-01', count: 12 }, { hostname: 'web-02', count: 40 }],
    });
    const quiet = await evaluateAlert(alert.id);
    expect(quiet.triggered).toBe(false);
    expect(getAlertHistory(alert.id)).toHaveLength(0);

    mockExecuteDSLQuery.mockResolvedValue({
      sql: 'SELECT 1',
      results: [{ hostname: 'web-01', count: 12 }, { hostname: 'db-01', count: 900 }],
    });
    const fired = await evaluateAlert(alert.id);
    expect(fired.triggered).toBe(true);
    const history = getAlertHistory(alert.id);
    expect(history).toHaveLength(1);
    expect(history[0].result_count).toBe(1);
    expect(JSON.parse(history[0].sample_results || '[]')).toEqual([{ hostname: 'db-01', count: 900 }]);
  });

  it('testAlert previews a custom condition', async () => {
    mockExecuteDSLQuery.mockResolvedValue({
      sql: 'SELECT 1',
      results: [{ hostname: 'web-01', count: 12 }, { hostname: 'db-01', count: 900 }],
    });
    const preview = await testAlert('search * | stats count by hostname', 'custom_condition', 'greater_than', 0, '-15m', 'count > 500');
    expect(preview.wouldTrigger).toBe(true);
    expect(preview.resultCount).toBe(1);
  });
});
