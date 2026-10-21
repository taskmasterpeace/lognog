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
  _labLightsTesting,
  latestRunStillMet,
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
    // 24 h before: 1000 errors -> about 10.5 per 15 min; 47 now is 4.5x.
    const d = decideLight(activity({ errors_15m: 47, errors_prev_24h: 1000 }), []);
    expect(d.state).toBe('red');
    expect(d.why).toBe('Error spike: 47 in 15 min, 4x normal');
    // Rounded down: 1140 a day is 12 per 15 min, and 47 is 3.9x, so it says 3x, never 4x.
    expect(decideLight(activity({ errors_15m: 47, errors_prev_24h: 1140 }), []).why).toBe('Error spike: 47 in 15 min, 3x normal');
    expect(decideLight(activity({ errors_15m: 12, errors_prev_24h: 0 }), []).why).toBe(
      'Error spike: 12 in 15 min, usually none',
    );
    // A few a day: say the daily count, not "usually none" and not a silly "94x".
    expect(decideLight(activity({ errors_15m: 47, errors_prev_24h: 46 }), []).why).toBe(
      'Error spike: 47 in 15 min, usually 46 a day',
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
    expect(alertTargets('search index=hyh severity<=3')).toEqual({ indexes: ['hyh'], apps: [], openIndexes: false });
    expect(alertTargets('index="Money-Watch" | stats count')).toEqual({ indexes: ['money-watch'], apps: [], openIndexes: false });
    expect(alertTargets("search (index='a' OR index=b) app_name=dp-web")).toEqual({ indexes: ['a', 'b'], apps: ['dp-web'], openIndexes: false });
    expect(alertTargets('search index=* severity<=3')).toEqual({ indexes: [], apps: [], openIndexes: true });
    expect(alertTargets('search index!=hyh')).toEqual({ indexes: [], apps: [], openIndexes: true });
    expect(alertTargets('search message="index=hyh"')).toEqual({ indexes: [], apps: [], openIndexes: true });
    // NOT index=x is a rule about everything else: it names no app.
    expect(alertTargets('search NOT index=main severity<=3')).toEqual({ indexes: [], apps: [], openIndexes: true });
    // The DSL can't parse NOT (...), so the scheduler can't run this rule: it lights nothing.
    expect(alertTargets('search NOT (index=main) app_name=dp-web')).toEqual({ indexes: [], apps: [], openIndexes: true });
    expect(alertTargets('search index=hyh NOT app_name=hyh-cron')).toEqual({ indexes: ['hyh'], apps: [], openIndexes: false });
    // Excluding an index inside one named index still reads only that index.
    expect(alertTargets('search index=shop NOT index=x')).toEqual({ indexes: ['shop'], apps: [], openIndexes: false });
  });

  it("reads the DSL's own field names: app= / program= / sourcetype= are the app, index_name= and IN lists count", () => {
    expect(alertTargets('search index=shop app=shop-worker severity<=3')).toEqual({ indexes: ['shop'], apps: ['shop-worker'], openIndexes: false });
    expect(alertTargets('search program=sshd index=sec')).toEqual({ indexes: ['sec'], apps: ['sshd'], openIndexes: false });
    expect(alertTargets('search sourcetype="Nginx" index_name=web')).toEqual({ indexes: ['web'], apps: ['nginx'], openIndexes: false });
    expect(alertTargets('search app IN ("x","y") index IN ("a","b")')).toEqual({ indexes: ['a', 'b'], apps: ['x', 'y'], openIndexes: false });
    expect(alertTargets('search index=shop | where app_name="w"')).toEqual({ indexes: ['shop'], apps: ['w'], openIndexes: false });
    expect(alertTargets('search app=shop-*')).toEqual({ indexes: [], apps: [], openIndexes: true });
  });

  it('a rule that can read indexes it does not name is open: wildcard, OR branch without an index, subsearch', () => {
    expect(alertTargets('search index=shop OR index=sec*').openIndexes).toBe(true);
    expect(alertTargets('search index=shop OR index=*').openIndexes).toBe(true);
    expect(alertTargets('search index=shop OR severity<=1').openIndexes).toBe(true);
    expect(alertTargets('search index=shop | append [search index=secret]').openIndexes).toBe(true);
    expect(alertTargets('search index=shop OR index_name=secret')).toEqual({ indexes: ['shop', 'secret'], apps: [], openIndexes: false });
  });

  it('end to end from the rule text: who lights, and which keys see it', () => {
    const rule = (q: string) => alert({ ...alertTargets(q) });
    const worker = { app: 'shop-worker', indexes: ['shop'] };
    const web = { app: 'shop-web', indexes: ['shop'] };
    // app= names the app: the neighbour in the same index stays dark (it used to turn red).
    const k2 = rule('search index=shop app=shop-worker severity<=3');
    expect(alertsForApp(worker, [k2])).toHaveLength(1);
    expect(alertsForApp(web, [k2])).toHaveLength(0);
    // app= alone: the app lights (it used to stay green "Fine"), for unscoped keys only.
    const a2 = rule('search app=shop-worker');
    expect(alertsForApp(worker, [a2])).toHaveLength(1);
    expect(alertsForApp(worker, [a2], ['shop'])).toHaveLength(0);
    // A key limited to shop never sees a rule that can also read another index.
    for (const q of [
      'search index=shop OR index=sec*',
      'search index=shop OR index=*',
      'search index=shop OR index_name=secret',
      'search app_name=shop-worker (index=shop OR index=sec*)',
      'search app_name=shop-worker (index=shop OR index=secret)',
      'search index=shop | append [search index=secret]',
    ]) {
      expect(alertsForApp(worker, [rule(q)], ['shop']), q).toHaveLength(0);
      expect(alertsForApp(worker, [rule(q)]), q).toHaveLength(1);
    }
    // ...but still sees one over just its own index, with or without the app.
    expect(alertsForApp(worker, [rule('search index=shop severity<=3')], ['shop'])).toHaveLength(1);
    expect(alertsForApp(worker, [rule('search app=shop-worker index=shop')], ['shop'])).toHaveLength(1);
    // An app-named rule over two indexes needs both readable.
    expect(alertsForApp(worker, [rule('search app=shop-worker index IN ("shop","secret")')], ['shop', 'secret'])).toHaveLength(1);
  });

  it('ties an alert to an app by index, or by app name when the key may read every index the rule names', () => {
    const app = { app: 'dp-web', indexes: ['directors-palette'] };
    expect(alertsForApp(app, [alert({ indexes: ['directors-palette'] })])).toHaveLength(1);
    expect(alertsForApp(app, [alert({ indexes: [], apps: ['dp-web'] })])).toHaveLength(1);
    expect(alertsForApp(app, [alert({ indexes: ['hyh'] })])).toHaveLength(0);
    // A scoped key must not learn about a rule over an index it can't read.
    expect(alertsForApp(app, [alert({ indexes: ['secret'], apps: ['dp-web'] })], ['directors-palette'])).toHaveLength(0);
  });

  it('an alert that names an app but no index searches every index: only an unscoped key sees it', () => {
    const rule = alert({ indexes: [], apps: ['shop-worker'] });
    expect(alertsForApp({ app: 'shop-worker', indexes: ['shop'] }, [rule])).toHaveLength(1);
    expect(alertsForApp({ app: 'shop-worker', indexes: ['shop'] }, [rule], ['shop'])).toHaveLength(0);
  });

  it('an index-only rule over two indexes is hidden from a key that can read only one of them', () => {
    const rule = alert({ indexes: ['shop', 'secret'], apps: [] });
    const shop = { app: 'shop-worker', indexes: ['shop'] };
    expect(alertsForApp(shop, [rule])).toHaveLength(1);
    expect(alertsForApp(shop, [rule], ['shop'])).toHaveLength(0);
    expect(alertsForApp(shop, [rule], ['shop', 'secret'])).toHaveLength(1);
    // A scoped key still sees a rule over just its own index.
    expect(alertsForApp(shop, [alert({ indexes: ['shop'], apps: [] })], ['shop'])).toHaveLength(1);
  });

  it('an alert that names neither an index nor an app lights nothing', () => {
    const rule = alert({ indexes: [], apps: [] });
    expect(alertsForApp({ app: 'shop-worker', indexes: ['shop'] }, [rule])).toHaveLength(0);
  });

  it('an alert that names an app lights only that app, not its neighbours in the same index', () => {
    const rule = alert({ indexes: ['shop'], apps: ['shop-worker'] });
    expect(alertsForApp({ app: 'shop-worker', indexes: ['shop'] }, [rule])).toHaveLength(1);
    expect(alertsForApp({ app: 'shop-web', indexes: ['shop'] }, [rule])).toHaveLength(0);
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

  it('a rule whose latest run no longer met its condition has cleared, even inside the throttle window', () => {
    const throttled = { last_status: 'ok', throttle_enabled: 1, throttle_window_seconds: 300 };
    // greater_than 10: the latest run counted 3, so the condition is gone.
    expect(isFiring(row({ ...throttled, trigger_condition: 'greater_than', trigger_threshold: 10, last_value: 3 }), NOW)).toBe(false);
    // ...but a throttled run that counted 40 is still firing.
    expect(isFiring(row({ ...throttled, trigger_condition: 'greater_than', trigger_threshold: 10, last_value: 40 }), NOW)).toBe(true);
    // A "no data" rule cleared once the latest run found logs again.
    expect(isFiring(row({ ...throttled, trigger_type: 'no_data', last_value: 12 }), NOW)).toBe(false);
    expect(isFiring(row({ ...throttled, trigger_type: 'no_data', last_value: 0 }), NOW)).toBe(true);
    // drops_by can't be re-judged from one value: the window decides.
    expect(isFiring(row({ ...throttled, trigger_condition: 'drops_by', trigger_threshold: 5, last_value: 3 }), NOW)).toBe(true);
    expect(latestRunStillMet(row({ trigger_type: 'custom_condition', last_value: 0 }))).toBeNull();
  });

  it('a "Logging Dead" rule (count less_than 1) clears once logs come back, inside the window', () => {
    const dead = { last_status: 'ok', throttle_enabled: 1, throttle_window_seconds: 300, trigger_condition: 'less_than', trigger_threshold: 1 };
    expect(isFiring(row({ ...dead, last_value: 0 }), NOW)).toBe(true);
    expect(isFiring(row({ ...dead, last_value: 5 }), NOW)).toBe(false);
    expect(latestRunStillMet(row({ trigger_condition: 'equal_to', trigger_threshold: 2, last_value: 2 }))).toBe(true);
    expect(latestRunStillMet(row({ trigger_condition: 'not_equal_to', trigger_threshold: 2, last_value: 2 }))).toBe(false);
  });

  it('a silenced rule is not firing', () => {
    expect(isFiring(row({ silenced: 1 }), NOW)).toBe(false);
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
    // A name with no words in it is shown as it is, never as a blank screen.
    expect(displayLabel('__')).toBe('__');
    // Syslog-style names lose their punctuation.
    expect(displayLabel('kernel:')).toBe('Kernel');
    expect(displayLabel('rsyslogd:')).toBe('Rsyslogd');
    // ...and their process id.
    expect(displayLabel('sshd[123]:')).toBe('Sshd');
    expect(displayLabel('rsyslogd[12]:')).toBe('Rsyslogd');
    expect(displayLabel('cron-job[9]')).toBe('Cron Job');
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

describe('since (when the light took its colour)', () => {
  const T1 = '2026-10-21T10:00:00.000Z';
  const T2 = '2026-10-21T10:05:00.000Z';
  const T3 = '2026-10-21T10:10:00.000Z';
  const d = (state: 'green' | 'yellow' | 'red', reason: string, since_hint: string | null = null) => ({ state, why: 'x: y', since_hint, reason });

  it('is unknown (null) on the first look, not the moment the API started', () => {
    _labLightsTesting.reset();
    expect(_labLightsTesting.sinceFor('*|a', d('green', 'fine'), T1)).toBeNull();
    expect(_labLightsTesting.sinceFor('*|a', d('green', 'fine'), T2)).toBeNull();
  });

  it('starts when the colour changes while watched, and holds through new wording', () => {
    _labLightsTesting.reset();
    _labLightsTesting.sinceFor('*|a', d('green', 'fine'), T1);
    expect(_labLightsTesting.sinceFor('*|a', d('red', 'spike'), T2)).toBe(T2);
    expect(_labLightsTesting.sinceFor('*|a', d('red', 'quiet-ish'), T3)).toBe(T2);
    expect(_labLightsTesting.sinceFor('*|a', d('green', 'fine'), T3)).toBe(T3);
  });

  it('a rule that knows its own start wins, even on the first look', () => {
    _labLightsTesting.reset();
    expect(_labLightsTesting.sinceFor('*|b', d('red', 'alert:1', T1), T3)).toBe(T1);
  });

  it('holds while the colour holds, even when an alert fires again with a newer time', () => {
    _labLightsTesting.reset();
    expect(_labLightsTesting.sinceFor('*|c', d('red', 'alert:1', T1), T1)).toBe(T1);
    expect(_labLightsTesting.sinceFor('*|c', d('red', 'alert:1', T3), T3)).toBe(T1);
    // A red first seen with no known start stays unknown, then learns one if a rule gives it.
    _labLightsTesting.reset();
    expect(_labLightsTesting.sinceFor('*|d', d('red', 'spike'), T1)).toBeNull();
    expect(_labLightsTesting.sinceFor('*|d', d('red', 'alert:1', T2), T3)).toBe(T2);
  });

  it('forgets an app it has not been asked about for a week (memory does not only grow)', () => {
    _labLightsTesting.reset();
    _labLightsTesting.sinceFor('*|old', d('green', 'fine'), T1);
    _labLightsTesting.sinceFor('*|new', d('green', 'fine'), T3);
    _labLightsTesting.pruneTransitions(Date.parse(T1) + 7 * 24 * 3600_000 + 60_000);
    expect(_labLightsTesting.remembered()).toBe(1);
  });
});
