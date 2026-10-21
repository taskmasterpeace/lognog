process.env.SQLITE_PATH = ':memory:';

import { describe, it, expect } from 'vitest';
import { getSQLiteDB } from './sqlite.js';
import { createAlert, createAlertHistoryEntry, getAlertHistory, getRecentAlertTrigger } from './sqlite-alerts.js';

describe('alert history order', () => {
  it('lists the newest run first even when several runs share the same second', () => {
    const alert = createAlert('same second', 'search *', { actions: [{ type: 'log', config: {} }] });
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(createAlertHistoryEntry(alert.id, i, 'medium', { trigger_value: String(i) }).id);
    }
    // Pin every row to the exact same timestamp so only the tie-break decides.
    getSQLiteDB().prepare("UPDATE alert_history SET triggered_at = '2026-10-21 03:00:00' WHERE alert_id = ?").run(alert.id);

    expect(getAlertHistory(alert.id).map((h) => h.id)).toEqual([...ids].reverse());
    expect(getAlertHistory().filter((h) => h.alert_id === alert.id).map((h) => h.id)).toEqual([...ids].reverse());
  });

  it('getRecentAlertTrigger returns the latest row within a tied second', () => {
    const alert = createAlert('recent tie', 'search *', { actions: [{ type: 'log', config: {} }] });
    createAlertHistoryEntry(alert.id, 1, 'medium');
    const last = createAlertHistoryEntry(alert.id, 2, 'medium');
    expect(getRecentAlertTrigger(alert.id, 3600)?.id).toBe(last.id);
  });
});
