/**
 * Scheduler reliability tests (issue #39).
 *
 * Covers:
 *  - the cron matcher firing `*​/7` correctly across an hour boundary
 *  - the cron matcher parsing comma-lists (e.g. `15,45 * * * *`)
 *  - missed-run recovery (drifted tick still fires because we compare to last_run)
 *  - schedule -> report-window mapping
 *  - the atomic throttle claim allowing exactly one fire per window
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';

// Isolated on-disk temp DB so the db/sqlite.ts singleton is harmless.
const TEST_DB = './lognog-test-scheduler.db';
process.env.SQLITE_PATH = TEST_DB;

import { shouldRunNow, reportWindowForSchedule } from './scheduler.js';
import { getSQLiteDB } from '../db/sqlite.js';
import { createAlert, claimAlertTrigger, getAlert } from '../db/sqlite-alerts.js';

// Build an ISO string for a local wall-clock time.
function at(y: number, mo: number, d: number, h: number, mi: number, s = 0): Date {
  return new Date(y, mo - 1, d, h, mi, s);
}

describe('cron matcher (shouldRunNow)', () => {
  it('fires */7 at minute 56 then again at the next hour boundary (:00)', () => {
    const schedule = '*/7 * * * *';
    // */7 matches :00,:07,:14,:21,:28,:35,:42,:49,:56 — NOT a clean divisor of 60.
    // After 12:56, the next valid fire is 13:00 (the hour boundary), proving the
    // old `nowMinute % 7` logic (which would expect :63) is gone.

    // Ran last at 12:56; at 13:00 the next fire after lastRun has arrived.
    const lastRun = at(2026, 1, 1, 12, 56).toISOString();
    expect(shouldRunNow(schedule, lastRun, at(2026, 1, 1, 13, 0))).toBe(true);

    // At 12:58 (between fires) it is NOT yet due relative to a 12:56 run.
    expect(shouldRunNow(schedule, lastRun, at(2026, 1, 1, 12, 58))).toBe(false);
  });

  it('matches the standard */7 fire minutes within an hour', () => {
    const schedule = '*/7 * * * *';
    // First-run (no last_run) => current-minute match.
    for (const m of [0, 7, 14, 21, 28, 35, 42, 49, 56]) {
      expect(shouldRunNow(schedule, null, at(2026, 1, 1, 9, m))).toBe(true);
    }
    for (const m of [1, 6, 8, 50, 55, 57, 59]) {
      expect(shouldRunNow(schedule, null, at(2026, 1, 1, 9, m))).toBe(false);
    }
  });

  it('parses comma-lists like 15,45 * * * *', () => {
    const schedule = '15,45 * * * *';
    expect(shouldRunNow(schedule, null, at(2026, 1, 1, 9, 15))).toBe(true);
    expect(shouldRunNow(schedule, null, at(2026, 1, 1, 9, 45))).toBe(true);
    expect(shouldRunNow(schedule, null, at(2026, 1, 1, 9, 30))).toBe(false);
    expect(shouldRunNow(schedule, null, at(2026, 1, 1, 9, 0))).toBe(false);

    // Due since a 9:15 run once 9:45 arrives.
    const lastRun = at(2026, 1, 1, 9, 15).toISOString();
    expect(shouldRunNow(schedule, lastRun, at(2026, 1, 1, 9, 45))).toBe(true);
    expect(shouldRunNow(schedule, lastRun, at(2026, 1, 1, 9, 44))).toBe(false);
  });

  it('recovers a missed run when the 60s tick drifts past the target minute', () => {
    // Daily report at 09:00. The interval drifted and the 09:00 minute was
    // skipped; the tick lands at 09:01. With the old exact-minute equality this
    // would never fire. Now: last run was yesterday 09:00, next fire is today
    // 09:00 which is <= 09:01, so it is due.
    const schedule = '0 9 * * *';
    const lastRun = at(2026, 1, 1, 9, 0).toISOString();
    expect(shouldRunNow(schedule, lastRun, at(2026, 1, 2, 9, 1))).toBe(true);
    // And it does NOT fire again later the same day.
    const ranToday = at(2026, 1, 2, 9, 1).toISOString();
    expect(shouldRunNow(schedule, ranToday, at(2026, 1, 2, 15, 0))).toBe(false);
  });

  it('rejects invalid cron expressions', () => {
    expect(shouldRunNow('not a cron', null, new Date())).toBe(false);
    expect(shouldRunNow('*/0 * * * *', null, new Date())).toBe(false);
  });
});

describe('reportWindowForSchedule', () => {
  it('maps sub-hourly schedules to -1h', () => {
    expect(reportWindowForSchedule('*/5 * * * *')).toBe('-1h');
    expect(reportWindowForSchedule('0 * * * *')).toBe('-1h'); // hourly, top of hour
    expect(reportWindowForSchedule('15,45 * * * *')).toBe('-1h');
  });

  it('maps daily schedules to -24h', () => {
    expect(reportWindowForSchedule('0 9 * * *')).toBe('-24h');
    expect(reportWindowForSchedule('30 0 * * *')).toBe('-24h');
  });

  it('maps weekly schedules to -7d', () => {
    expect(reportWindowForSchedule('0 9 * * 1')).toBe('-7d'); // Mondays
    expect(reportWindowForSchedule('0 0 * * 0')).toBe('-7d'); // Sundays
  });

  it('maps monthly schedules to -30d', () => {
    expect(reportWindowForSchedule('0 0 1 * *')).toBe('-30d'); // 1st of month
  });

  it('defaults to -24h on an unparseable schedule', () => {
    expect(reportWindowForSchedule('garbage')).toBe('-24h');
  });
});

describe('atomic throttle claim (claimAlertTrigger)', () => {
  beforeEach(() => {
    const db = getSQLiteDB();
    db.exec('DELETE FROM alerts');
  });

  afterAll(() => {
    try {
      fs.unlinkSync(TEST_DB);
    } catch {
      /* ignore */
    }
  });

  it('allows exactly one fire per throttle window', () => {
    const alert = createAlert('throttle-test', 'search *', {
      throttle_enabled: true,
      throttle_window_seconds: 300,
    });

    const now = new Date();
    const nowIso = now.toISOString();
    const windowStartIso = new Date(now.getTime() - 300 * 1000).toISOString();

    // Simulate two concurrent evaluations racing on the same window. Statements
    // run serially in better-sqlite3, so exactly one wins.
    const first = claimAlertTrigger(alert.id, nowIso, windowStartIso);
    const second = claimAlertTrigger(alert.id, nowIso, windowStartIso);

    expect(first).toBe(true);
    expect(second).toBe(false);

    // trigger_count incremented exactly once, last_triggered recorded.
    const after = getAlert(alert.id)!;
    expect(after.trigger_count).toBe(1);
    expect(after.last_triggered).toBe(nowIso);
  });

  it('allows a new fire once the throttle window has elapsed', () => {
    const alert = createAlert('throttle-window-test', 'search *', {
      throttle_enabled: true,
      throttle_window_seconds: 60,
    });

    // First fire at T-120s.
    const firstFire = new Date(Date.now() - 120 * 1000).toISOString();
    expect(
      claimAlertTrigger(alert.id, firstFire, new Date(Date.now() - 180 * 1000).toISOString())
    ).toBe(true);

    // Now, 120s later, the 60s window has long passed -> a new claim succeeds.
    const now = new Date();
    const nowIso = now.toISOString();
    const windowStartIso = new Date(now.getTime() - 60 * 1000).toISOString();
    expect(claimAlertTrigger(alert.id, nowIso, windowStartIso)).toBe(true);

    const after = getAlert(alert.id)!;
    expect(after.trigger_count).toBe(2);
  });
});
