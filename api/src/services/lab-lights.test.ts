/**
 * Lab lights rule, alert parsing and the Data Sources status rule, as pure
 * functions (no database). The end-to-end checks with real logs and alerts
 * are in db/app-activity.test.ts and routes/status.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  alertTargets,
  alertsForApp,
  decideLight,
  displayLabel,
  isFiring,
  normalErrorsPer15m,
  plainAge,
  WHY_HEADLINES,
  type FiringAlert,
} from './lab-lights.js';
import { ageSecondsFrom, parseServerTime, sourceStatusFromAge } from './source-status.js';
import type { AppActivity } from '../db/backend.js';

const NOW = Date.parse('2026-10-21T12:00:00.000Z');
const MIN = 60;

function activity(over: Partial<AppActivity> = {}): AppActivity {
  const age = over.age_seconds ?? 30;
  return {
    app: 'hyh',
    indexes: ['hyh'],
    last_seen: Number.isFinite(age) ? new Date(NOW - age * 1000).toISOString() : null,
    age_seconds: age,
    logs_15m: 120,
    errors_15m: 0,
    errors_prev_24h: 0,
    ...over,
  };
}

function alert(over: Partial<FiringAlert> = {}): FiringAlert {
  return {
    id: 'a1',
    name: 'HYH checkout errors',
    severity: 'high',
    fired_at: new Date(NOW - 5 * 60_000).toISOString(),
    indexes: ['hyh'],
    apps: [],
    ...over,
  };
}

describe('Data Sources status rule (services/source-status.ts)', () => {
  it('uses the thresholds the Data Sources page showed: 15 min, 1 hour, 1 day', () => {
    expect(sourceStatusFromAge(0)).toBe('active');
    expect(sourceStatusFromAge(15 * MIN - 1)).toBe('active');
    expect(sourceStatusFromAge(15 * MIN)).toBe('recent');
    expect(sourceStatusFromAge(60 * MIN - 1)).toBe('recent');
    expect(sourceStatusFromAge(60 * MIN)).toBe('inactive');
    expect(sourceStatusFromAge(24 * 60 * MIN - 1)).toBe('inactive');
    expect(sourceStatusFromAge(24 * 60 * MIN)).toBe('stale');
  });

  it('treats a log stamped in the future (clock skew) as just now, and no time as stale', () => {
    expect(sourceStatusFromAge(-120)).toBe('active');
    expect(sourceStatusFromAge(Number.POSITIVE_INFINITY)).toBe('stale');
    expect(ageSecondsFrom(null, NOW)).toBe(Number.POSITIVE_INFINITY);
    expect(ageSecondsFrom('not a time', NOW)).toBe(Number.POSITIVE_INFINITY);
  });

  it('reads zone-less server times as UTC, not as the server\'s local time', () => {
    // ClickHouse DateTime64 text has no zone. The old UI parsed it with
    // new Date(), which treats it as local time and shifts the age by hours.
    expect(parseServerTime('2026-10-21 11:50:00.000')).toBe(Date.parse('2026-10-21T11:50:00.000Z'));
    expect(parseServerTime('2026-10-21T11:50:00Z')).toBe(Date.parse('2026-10-21T11:50:00.000Z'));
    expect(parseServerTime('2026-10-21T07:50:00-04:00')).toBe(Date.parse('2026-10-21T11:50:00.000Z'));
    expect(ageSecondsFrom('2026-10-21 11:50:00', NOW)).toBe(600);
  });
});

describe('decideLight', () => {
  it('is green with the 15-minute counts when logs are fresh and errors normal', () => {
    expect(decideLight(activity(), [])).toMatchObject({ state: 'green', why: 'Fine: 120 logs in 15 min, no errors' });
    expect(decideLight(activity({ errors_15m: 2, errors_prev_24h: 200 }), []).why).toBe('Fine: 120 logs, 2 errors in 15 min');
  });

  it('is red on an error spike: 10+ errors and 3x normal, saying how far above normal', () => {
    // 24 h before: 1140 errors -> about 12 per 15 min; 47 now is ~4x.
    const d = decideLight(activity({ errors_15m: 47, errors_prev_24h: 1140 }), []);
    expect(d.state).toBe('red');
    expect(d.why).toBe('Error spike: 47 in 15 min, 4x normal');
    expect(decideLight(activity({ errors_15m: 12, errors_prev_24h: 0 }), []).why).toBe(
      'Error spike: 12 in 15 min, usually none',
    );
  });

  it('is not red when a busy app has its usual error count', () => {
    // ~12 per 15 min is normal for this app: 20 now is under 2x (24), so still green.
    expect(decideLight(activity({ errors_15m: 20, errors_prev_24h: 1140 }), []).state).toBe('green');
    // 9 errors is under the 10 floor even from zero: yellow "errors up", not red.
    expect(decideLight(activity({ errors_15m: 9, errors_prev_24h: 0 }), [])).toMatchObject({
      state: 'yellow',
      why: 'Errors up: 9 in 15 min, usually none',
    });
  });

  it('is red when the app has gone quiet for an hour, using the Data Sources rule', () => {
    const d = decideLight(activity({ age_seconds: 3 * 3600, logs_15m: 0 }), []);
    expect(d).toMatchObject({ state: 'red', why: 'Gone quiet: no logs for 3 h' });
    // The red started when the app crossed the 1-hour line.
    expect(d.since_hint).toBe(new Date(NOW - 3 * 3600_000 + 3600_000).toISOString());
    expect(decideLight(activity({ age_seconds: 3 * 86400, logs_15m: 0 }), []).why).toBe('Gone quiet: no logs for 3 days');
  });

  it('is yellow when quiet 15-60 minutes (Data Sources "Recent")', () => {
    const d = decideLight(activity({ age_seconds: 40 * MIN, logs_15m: 0 }), []);
    expect(d).toMatchObject({ state: 'yellow', why: 'Quiet: no logs for 40 min' });
    expect(d.since_hint).toBe(new Date(NOW - 40 * 60_000 + 15 * 60_000).toISOString());
  });

  it('is red "Gone quiet: no logs in 7 days" when there is no newest log at all', () => {
    expect(decideLight(activity({ last_seen: null, age_seconds: Number.POSITIVE_INFINITY }), [])).toMatchObject({
      state: 'red',
      why: 'Gone quiet: no logs in 7 days',
    });
  });

  it('a firing high/critical alert is red and wins over everything; medium/low/warning is yellow; info is ignored', () => {
    const quiet = activity({ age_seconds: 3 * 3600 });
    expect(decideLight(quiet, [alert()])).toMatchObject({ state: 'red', why: 'Alert: HYH checkout errors' });
    expect(decideLight(activity(), [alert({ severity: 'critical' })]).state).toBe('red');
    for (const severity of ['medium', 'warning', 'low']) {
      expect(decideLight(activity(), [alert({ severity })])).toMatchObject({ state: 'yellow', why: 'Alert: HYH checkout errors' });
    }
    expect(decideLight(activity(), [alert({ severity: 'info' })]).state).toBe('green');
    // A spike outranks a yellow alert.
    expect(decideLight(activity({ errors_15m: 50 }), [alert({ severity: 'medium' })]).why).toMatch(/^Error spike/);
  });

  it('names the oldest firing alert and counts the rest; its since is when it fired', () => {
    const older = alert({ id: 'b', name: 'Older', fired_at: new Date(NOW - 30 * 60_000).toISOString() });
    const d = decideLight(activity(), [alert(), older]);
    expect(d.why).toBe('Alert: Older (+1 more)');
    expect(d.since_hint).toBe(older.fired_at);
  });

  it('keeps the why short enough for a 240 px round screen', () => {
    const d = decideLight(activity(), [alert({ name: 'x'.repeat(200) })]);
    expect(d.why.length).toBeLessThanOrEqual(80);
    expect(d.why.endsWith('…')).toBe(true);
  });
});

describe('why always starts with a headline', () => {
  it('so the screen can show it big', () => {
    const cases = [
      decideLight(activity(), []),
      decideLight(activity({ errors_15m: 50 }), []),
      decideLight(activity({ errors_15m: 5 }), []),
      decideLight(activity({ age_seconds: 40 * MIN }), []),
      decideLight(activity({ age_seconds: 5 * 3600 }), []),
      decideLight(activity({ last_seen: null, age_seconds: Number.POSITIVE_INFINITY }), []),
      decideLight(activity(), [alert()]),
      decideLight(activity(), [alert({ severity: 'low' })]),
    ];
    for (const d of cases) {
      const head = d.why.split(': ')[0];
      expect(WHY_HEADLINES as readonly string[]).toContain(head);
    }
  });
});

describe('alert targets', () => {
  it('reads index= and app_name= from a rule search, quoted or bare, ignoring wildcards and negations', () => {
    expect(alertTargets('search index=hyh severity<=3')).toEqual({ indexes: ['hyh'], apps: [] });
    expect(alertTargets('index="Money-Watch" | stats count')).toEqual({ indexes: ['money-watch'], apps: [] });
    expect(alertTargets("search (index='a' OR index=b) app_name=dp-web")).toEqual({ indexes: ['a', 'b'], apps: ['dp-web'] });
    expect(alertTargets('search index=* severity<=3')).toEqual({ indexes: [], apps: [] });
    expect(alertTargets('search index!=hyh')).toEqual({ indexes: [], apps: [] });
    expect(alertTargets('search message="index=hyh"')).toEqual({ indexes: [], apps: [] });
  });

  it('ties an alert to an app by index, or by app name when the key may read every index the rule names', () => {
    const app = { app: 'dp-web', indexes: ['directors-palette'] };
    expect(alertsForApp(app, [alert({ indexes: ['directors-palette'] })])).toHaveLength(1);
    expect(alertsForApp(app, [alert({ indexes: [], apps: ['dp-web'] })])).toHaveLength(1);
    expect(alertsForApp(app, [alert({ indexes: ['hyh'] })])).toHaveLength(0);
    // A scoped key must not learn about a rule over an index it can't read.
    expect(alertsForApp(app, [alert({ indexes: ['secret'], apps: ['dp-web'] })], ['directors-palette'])).toHaveLength(0);
  });
});

describe('isFiring', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'a1',
    name: 'x',
    severity: 'high',
    search_query: 'index=hyh',
    last_run: new Date(NOW - 60_000).toISOString(),
    last_triggered: new Date(NOW - 60_000).toISOString(),
    last_status: 'triggered',
    throttle_enabled: 0,
    throttle_window_seconds: 300,
    last_ack: 0,
    ...over,
  });

  it('fires when the latest run fired and nobody acknowledged it', () => {
    expect(isFiring(row(), NOW)).toBe(true);
    expect(isFiring(row({ last_ack: 1 }), NOW)).toBe(false);
    expect(isFiring(row({ last_status: 'ok' }), NOW)).toBe(false);
  });

  it('a throttled re-check records "ok" but the alert is still firing inside its window', () => {
    expect(isFiring(row({ last_status: 'ok', throttle_enabled: 1, throttle_window_seconds: 300 }), NOW)).toBe(true);
    expect(
      isFiring(row({ last_status: 'ok', throttle_enabled: 1, throttle_window_seconds: 30 }), NOW),
    ).toBe(false);
  });

  it('ignores a rule that has not run for a day (the scheduler is off, the state is old)', () => {
    const old = new Date(NOW - 26 * 3600_000).toISOString();
    expect(isFiring(row({ last_run: old, last_triggered: old }), NOW)).toBe(false);
  });

  it('reads zone-less SQLite datetime text as UTC', () => {
    expect(isFiring(row({ last_run: '2026-10-21 11:59:00', last_triggered: '2026-10-21 11:59:00' }), NOW)).toBe(true);
  });
});

describe('words on the screen', () => {
  it('labels apps the way the shelf shows them', () => {
    expect(displayLabel('hyh')).toBe('HYH');
    expect(displayLabel('directors-palette')).toBe('Directors Palette');
    expect(displayLabel('money_watch')).toBe('Money Watch');
    expect(displayLabel('knuckle-up')).toBe('Knuckle Up');
  });

  it('says ages in plain words', () => {
    expect(plainAge(40 * MIN)).toBe('40 min');
    expect(plainAge(3 * 3600 + 59 * MIN)).toBe('3 h');
    expect(plainAge(47 * 3600)).toBe('47 h');
    expect(plainAge(3 * 86400)).toBe('3 days');
  });

  it('measures normal against the 24 h before the last 15 min', () => {
    expect(normalErrorsPer15m(1425)).toBeCloseTo(15, 5);
    expect(normalErrorsPer15m(0)).toBe(0);
  });
});
