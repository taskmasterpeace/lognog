import { describe, it, expect } from 'vitest';
import { shouldRunNow } from './scheduler.js';

/**
 * `last_run` values written by older builds use SQLite's `datetime('now')`
 * form (UTC, no zone marker). They must be read as UTC regardless of the host
 * timezone, otherwise schedules drift on non-UTC (Lite/Windows) installs.
 */
describe('shouldRunNow with legacy last_run timestamps', () => {
  it('treats "YYYY-MM-DD HH:MM:SS" as UTC', () => {
    // last ran 12:00Z; a */5 schedule is due at 12:05Z.
    expect(shouldRunNow('*/5 * * * *', '2026-09-02 12:00:00', new Date('2026-09-02T12:05:30Z'))).toBe(true);
    expect(shouldRunNow('*/5 * * * *', '2026-09-02 12:00:00', new Date('2026-09-02T12:03:00Z'))).toBe(false);
  });

  it('still accepts ISO timestamps', () => {
    expect(shouldRunNow('*/5 * * * *', '2026-09-02T12:00:00.000Z', new Date('2026-09-02T12:05:30Z'))).toBe(true);
  });
});
