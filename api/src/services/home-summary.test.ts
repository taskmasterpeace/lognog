/**
 * Home page ("Needs you") logic.
 *
 * - ClickHouse: the live server runs ClickHouse, which isn't available in the
 *   test run, so its SQL is checked as text (time bounds as instants, error
 *   definition, index scope, money index, numeric cost_usd only).
 * - SQLite (lite): the same logic runs against a real lite logs database with
 *   seeded rows, and the Home drill-down queries (ui/src/utils/homeDrilldown.ts)
 *   run through the real DSL engine to prove they find the rows behind each number.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

process.env.LOGNOG_BACKEND = 'sqlite';
process.env.LOGS_DB_PATH = join(
  tmpdir(),
  `lognog-home-test-${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}.db`,
);

import { insertLogs, executeDSLQuery } from '../db/backend.js';
import { createAlert, createNotificationChannel } from '../db/sqlite.js';
import {
  buildAppActivitySql,
  buildMoneySnapshotSql,
  buildMoneyPresenceSql,
  buildAiSpendSql,
  timeLiteral,
  assessApp,
  sortApps,
  getHomeSummary,
  parseServerTime,
  homeThresholds,
  formatDuration,
  needsYouFrom,
  DAY,
  HOUR,
  MINUTE,
  type AppActivityRow,
  type AppSummary,
} from './home-summary.js';

const NOW = Date.UTC(2026, 9, 21, 15, 0, 0); // 2026-10-21 15:00:00 UTC

describe('ClickHouse SQL builders (live backend)', () => {
  it('bounds every window by instants, not server-zone strings', () => {
    const sql = buildAppActivitySql('clickhouse', NOW);
    expect(sql).toContain(`fromUnixTimestamp64Milli(toInt64(${NOW}))`);
    expect(sql).toContain(`fromUnixTimestamp64Milli(toInt64(${NOW - 14 * DAY}))`);
    expect(sql).toContain(`countIf(timestamp >= fromUnixTimestamp64Milli(toInt64(${NOW - DAY})) AND severity <= 3) AS errors_today`);
    expect(sql).toContain(
      `countIf(timestamp >= fromUnixTimestamp64Milli(toInt64(${NOW - 8 * DAY})) AND timestamp < fromUnixTimestamp64Milli(toInt64(${NOW - DAY})) AND severity <= 3) AS errors_baseline`,
    );
    expect(sql).toContain('FROM lognog.logs');
    expect(sql).toContain('toUnixTimestamp64Milli(max(timestamp)) AS last_seen');
    expect(sql).toContain(
      'if(length(arrayReverseSort(arrayPopFront(arrayDifference(arraySort(groupUniqArray(toUnixTimestamp(toStartOfMinute(timestamp))))))) AS gaps_desc) = 0, 0, gaps_desc[1]) AS longest_gap_s',
    );
    // "normal" silence = the 3rd-longest gap, so one or two outages can't stretch it
    expect(sql).toContain('if(length(gaps_desc) = 0, 0, gaps_desc[least(3, length(gaps_desc))]) AS normal_gap_s');
    expect(sql).toContain('GROUP BY app_name, index_name');
    expect(sql).not.toMatch(/now\(\)|datetime\('now'|INTERVAL/);
    expect(sql).not.toContain('IN (');
  });

  it('ANDs a scoped key\'s indexes into the WHERE', () => {
    const sql = buildAppActivitySql('clickhouse', NOW, ['Uptime', "o'brien"]);
    expect(sql).toContain(`WHERE timestamp >= fromUnixTimestamp64Milli(toInt64(${NOW - 14 * DAY})) AND timestamp <= fromUnixTimestamp64Milli(toInt64(${NOW})) AND index_name IN ('uptime','o''brien')`);
  });

  it('reads the latest money-watch snapshot from index money', () => {
    const sql = buildMoneySnapshotSql('clickhouse', NOW);
    expect(sql).toContain("WHERE index_name = 'money'");
    expect(sql).toContain("JSONExtractString(structured_data, 'kind') = 'snapshot'");
    expect(sql).toContain("JSONExtractFloat(structured_data, 'out_24h') AS out_24h");
    expect(sql).toContain("JSONExtractFloat(structured_data, 'out_7d') AS out_7d");
    expect(sql).toContain('ORDER BY timestamp DESC\nLIMIT 1');
    expect(buildMoneyPresenceSql('clickhouse', NOW)).toContain(
      "SELECT count() AS events, toUnixTimestamp64Milli(max(timestamp)) AS last_at\nFROM lognog.logs\nWHERE index_name = 'money'",
    );
  });

  it('sums cost_usd above zero the way the DSL reads it, with today split out', () => {
    const sql = buildAiSpendSql('clickhouse', NOW - 7 * DAY, NOW, NOW - DAY, ['dp']);
    // same value expression the DSL compiles for `cost_usd>0` (the drill-down)
    expect(sql).toContain("toFloat64OrNull(if(JSONType(structured_data, 'cost_usd') = 'String', JSONExtractString(structured_data, 'cost_usd'), JSONExtractRaw(structured_data, 'cost_usd'))) AS cost");
    expect(sql).toContain('WHERE cost > 0');
    expect(sql).toContain(`sumIf(cost, timestamp >= fromUnixTimestamp64Milli(toInt64(${NOW - DAY}))) AS spend_recent`);
    expect(sql).toContain("AND index_name IN ('dp')");
  });

  it('rejects a time that is not a number', () => {
    expect(() => timeLiteral('clickhouse', Number.NaN)).toThrow();
    expect(timeLiteral('sqlite', NOW)).toBe("'2026-10-21 15:00:00.000'");
  });
});

function row(p: Partial<AppActivityRow>): AppActivityRow {
  return {
    app_name: 'app',
    index_name: 'main',
    logs_window: 1000,
    logs_today: 100,
    errors_today: 0,
    errors_baseline: 0,
    first_seen: NOW - 14 * DAY,
    last_seen: NOW - MINUTE,
    active_minutes: 500,
    longest_gap_s: 600,
    normal_gap_s: 600,
    ...p,
  };
}

describe('judging an app against its own history', () => {
  const t = { ...homeThresholds(), spikeMultiplier: 3, spikeMinErrors: 5, quietMultiplier: 2, quietFloorMs: 30 * MINUTE };

  it('flags errors at 3x a normal day and says so in words', () => {
    const a = assessApp(row({ errors_today: 47, errors_baseline: 84 }), NOW, t); // 12/day
    expect(a.state).toBe('errors');
    expect(a.error_ratio).toBe(3.9);
    expect(a.label).toBe('Errors 4× normal');
    expect(a.detail).toBe('47 errors in the last 24 h; a normal day has about 12.');
  });

  it('a normal day of errors is fine', () => {
    const a = assessApp(row({ errors_today: 12, errors_baseline: 84 }), NOW, t);
    expect(a.state).toBe('fine');
    expect(a.detail).toBe('100 logs and 12 errors in the last 24 h, about a normal day.');
  });

  it('a few errors on a clean app are not a spike, five are', () => {
    expect(assessApp(row({ errors_today: 4 }), NOW, t).state).toBe('fine');
    const a = assessApp(row({ errors_today: 5 }), NOW, t);
    expect(a.state).toBe('errors');
    expect(a.label).toBe('Errors, 5 today');
    expect(a.detail).toBe('5 errors in the last 24 h; a normal day has none.');
  });

  it('averages the baseline over the days the app actually existed', () => {
    // 3 days of history before today with 30 errors = 10/day; 30 today is 3x.
    const a = assessApp(row({ first_seen: NOW - 4 * DAY, errors_today: 30, errors_baseline: 30 }), NOW, t);
    expect(a.baseline_days).toBe(3);
    expect(a.baseline_errors_per_day).toBe(10);
    expect(a.state).toBe('errors');
  });

  it('an app younger than a day is too new to judge', () => {
    const a = assessApp(row({ first_seen: NOW - 5 * HOUR, errors_today: 50 }), NOW, t);
    expect(a.state).toBe('new');
    expect(a.label).toBe('New');
  });

  it('quiet = silent longer than twice its normal gap (never under 30 min)', () => {
    const quiet = assessApp(row({ last_seen: NOW - 3 * HOUR, longest_gap_s: 3600, normal_gap_s: 3600 }), NOW, t);
    expect(quiet.state).toBe('quiet');
    expect(quiet.label).toBe('Quiet 3 h');
    expect(quiet.detail).toBe('No logs for 3 h. Normally it is never silent for more than about 1 h.');
    expect(assessApp(row({ last_seen: NOW - 90 * MINUTE, normal_gap_s: 3600 }), NOW, t).state).toBe('fine');
    // a chatty app (1-minute gaps) is quiet after the 30-minute floor, not after 2 minutes
    expect(assessApp(row({ last_seen: NOW - 20 * MINUTE, normal_gap_s: 60 }), NOW, t).state).toBe('fine');
    expect(assessApp(row({ last_seen: NOW - 40 * MINUTE, normal_gap_s: 60 }), NOW, t).label).toBe('Quiet 40 min');
  });

  it('a nightly-silent app is not quiet at night', () => {
    // logs all day, silent 9 h every night: 6 h of silence is normal for it
    expect(assessApp(row({ last_seen: NOW - 6 * HOUR, longest_gap_s: 9 * 3600, normal_gap_s: 9 * 3600 }), NOW, t).state).toBe('fine');
  });

  it('one old outage does not hide the app dying again (critic 10-21 #1)', () => {
    // a 4-day outage 8-12 days ago is its longest gap, but its normal gap is 10 minutes:
    // silent for the last 3 days = quiet, not "Fine"
    const a = assessApp(
      row({ last_seen: NOW - 3 * DAY, logs_today: 0, longest_gap_s: 4 * 86400, normal_gap_s: 600 }),
      NOW,
      t,
    );
    expect(a.state).toBe('quiet');
    expect(a.label).toBe('Quiet 3 days');
  });

  it('an app younger than a day is never called quiet (critic 10-21 #2)', () => {
    // first seen 3 h ago, 11 active minutes, silent 2 h: too new to have a rhythm
    const a = assessApp(
      row({ first_seen: NOW - 3 * HOUR, last_seen: NOW - 2 * HOUR, active_minutes: 11, longest_gap_s: 120, normal_gap_s: 60 }),
      NOW,
      t,
    );
    expect(a.state).toBe('new');
    expect(a.quiet_after_ms).toBeNull();
  });

  it('a quiet app that spiked first keeps the spike, in words and in Needs you (critic 10-21 r2 #1)', () => {
    // 47 errors (12/day normal), then silent 3 h: a crash looks like this
    const a = assessApp(
      row({ errors_today: 47, errors_baseline: 84, last_seen: NOW - 3 * HOUR, longest_gap_s: 3600, normal_gap_s: 3600 }),
      NOW,
      t,
    );
    expect(a.state).toBe('quiet');
    expect(a.error_spike).toBe(true);
    expect(a.detail).toBe(
      'No logs for 3 h. Normally it is never silent for more than about 1 h. ' +
        'Before that: 47 errors in the last 24 h; a normal day has about 12.',
    );
    expect(needsYouFrom([a], []).map(i => i.kind)).toEqual(['error_spike', 'quiet']);
    // the spike row gets the error sentence, not the silence
    expect(a.spike_detail).toBe('47 errors in the last 24 h; a normal day has about 12.');
    // a plain spike is one row, a plain quiet app is one row
    const spike = assessApp(row({ errors_today: 47, errors_baseline: 84 }), NOW, t);
    expect(needsYouFrom([spike], []).map(i => i.kind)).toEqual(['error_spike']);
    const quiet = assessApp(row({ last_seen: NOW - 3 * HOUR, normal_gap_s: 3600 }), NOW, t);
    expect(quiet.error_spike).toBe(false);
    expect(quiet.spike_detail).toBeNull();
    expect(needsYouFrom([quiet], []).map(i => i.kind)).toEqual(['quiet']);
  });

  it('an old app with too few active minutes is "Few logs", not "New" (critic 10-21 r2 #2)', () => {
    // 10 days old, 2 active minutes in 14 days: not new, but no rhythm to judge quiet by
    const a = assessApp(
      row({ first_seen: NOW - 10 * DAY, last_seen: NOW - 5 * HOUR, logs_today: 2, active_minutes: 2 }),
      NOW,
      t,
    );
    expect(a.state).toBe('sparse');
    expect(a.label).toBe('Few logs');
    expect(a.detail).toBe(
      '2 logs in the last 24 h. Only 2 active minutes in 14 days, too few to tell if it has gone quiet. Last log 5 h ago.',
    );
    expect(a.quiet_after_ms).toBeNull();
    // still flags an error spike
    expect(assessApp(row({ first_seen: NOW - 10 * DAY, active_minutes: 2, errors_today: 9 }), NOW, t).state).toBe('errors');
  });

  it('durations round down, like "last seen" beside them (critic 10-21 r2 #5)', () => {
    expect(formatDuration(3 * HOUR + 59 * MINUTE)).toBe('3 h');
    expect(formatDuration(59 * MINUTE + 59_000)).toBe('59 min');
    expect(formatDuration(47 * HOUR + 59 * MINUTE)).toBe('47 h');
    expect(formatDuration(3 * DAY + 23 * HOUR)).toBe('3 days');
    expect(formatDuration(-5)).toBe('0 min');
  });

  it('sorts worst first', () => {
    const apps: AppSummary[] = [
      assessApp(row({ app_name: 'fine-a', logs_today: 5 }), NOW, t),
      assessApp(row({ app_name: 'quiet-b', last_seen: NOW - 5 * HOUR }), NOW, t),
      assessApp(row({ app_name: 'errors-c', errors_today: 40, errors_baseline: 7 }), NOW, t),
      assessApp(row({ app_name: 'fine-d', logs_today: 50 }), NOW, t),
    ];
    expect(sortApps(apps).map(a => a.app_name)).toEqual(['errors-c', 'quiet-b', 'fine-d', 'fine-a']);
  });

  it('reads zone-less server times as UTC', () => {
    expect(parseServerTime('2026-10-21 15:00:00.000')).toBe(NOW);
    expect(parseServerTime('2026-10-21T15:00:00.000')).toBe(NOW);
    expect(parseServerTime('2026-10-21T15:00:00.000Z')).toBe(NOW);
    expect(parseServerTime(String(NOW))).toBe(NOW);
    expect(parseServerTime(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SQLite end to end
// ---------------------------------------------------------------------------

interface HomeDrill {
  appErrorsUrl(i: string, a: string, e?: string): string;
  appLogsUrl(i: string, a: string, e?: string): string;
  moneySnapshotQuery(): string;
  aiSpendQuery(i?: string, a?: string): string;
  sourceErrorsQuery(i: string, a: string): string;
  sourceLogsQuery(i: string, a: string): string;
  alertFixUrl(id: string): string;
  TODAY_EARLIEST: string;
  WEEK_EARLIEST: string;
}
const UI_MODULE = resolve(__dirname, '../../../ui/src/utils/homeDrilldown.ts');

async function countOf(query: string, earliest: string): Promise<number> {
  const { results } = await executeDSLQuery<{ count: number }>(`${query} | stats count`, { earliest });
  return Number(results[0]?.count ?? 0);
}

describe('Home summary on the lite (SQLite) backend', () => {
  let ui: HomeDrill;
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString().replace('Z', '');

  beforeAll(async () => {
    ui = (await import(/* @vite-ignore */ UI_MODULE)) as HomeDrill;
    const rows: Record<string, unknown>[] = [];
    const add = (index_name: string, app_name: string, severity: number, msAgo: number, extra: Record<string, unknown> = {}) =>
      rows.push({
        timestamp: iso(msAgo),
        index_name,
        app_name,
        hostname: 'h',
        severity,
        message: `${app_name} ${severity}`,
        structured_data: JSON.stringify({ message: `${app_name} ${severity}`, ...extra }),
      });

    // steady: a log every 30 min for 10 days, 1 error a day, last log 10 min ago
    for (let m = 10; m < 10 * 24 * 60; m += 30) add('apps', 'steady', m % 1440 < 30 ? 3 : 6, m * MINUTE);
    // spiky: same rhythm, 1 error/day before today, 20 errors in the last 24 h
    for (let m = 5; m < 10 * 24 * 60; m += 30) add('apps', 'spiky', m > 1440 && m % 1440 < 30 ? 3 : 6, m * MINUTE);
    for (let i = 0; i < 20; i++) add('apps', 'spiky', 3, (i * 60 + 7) * MINUTE);
    // sleepy: every 20 min for 9 days, then nothing for the last 5 hours
    for (let m = 301; m < 9 * 24 * 60; m += 20) add('apps', 'sleepy', 6, m * MINUTE);
    // relapsed: every 10 min for 14 days, a 4-day outage 8-12 days ago, and silent again for the last 3 days
    for (let m = 3 * 24 * 60 + 5; m < 14 * 24 * 60 - 60; m += 10) {
      if (m > 8 * 24 * 60 && m < 12 * 24 * 60) continue;
      add('apps', 'relapsed', 6, m * MINUTE);
    }
    // fresh: first seen 3 h ago, 11 minutes of logs, nothing for the last 2 h
    for (let i = 0; i < 11; i++) add('apps', 'fresh', 6, (180 - i * 6) * MINUTE);
    // money-watch shaped events (fake numbers): an old and a new snapshot
    add('money', 'money-watch', 6, 26 * HOUR, { kind: 'snapshot', out_24h: 999, out_7d: 9999 });
    add('money', 'money-watch', 6, 2 * HOUR, { kind: 'snapshot', out_24h: 12.5, out_7d: 210.25 });
    add('money', 'money-watch', 6, 2 * HOUR, { kind: 'category', category: 'food', out_7d: 50 });
    // AI spend: 3 today (one sent as a string), 1 three days ago, one outside the week, one zero
    add('apps', 'steady', 6, 1 * HOUR, { cost_usd: 0.5 });
    add('apps', 'steady', 6, 2 * HOUR, { cost_usd: 1.25 });
    add('apps', 'spiky', 6, 3 * DAY, { cost_usd: 2 });
    add('apps', 'spiky', 6, 3 * HOUR, { cost_usd: '9' });
    add('apps', 'spiky', 6, 9 * DAY, { cost_usd: 100 });
    add('apps', 'spiky', 6, 4 * HOUR, { cost_usd: 0 });
    await insertLogs(rows);

    // one alert whose apprise channel doesn't exist, one that delivers fine
    createNotificationChannel('LogNog Alerts', 'email', 'mailto://robert@example.invalid');
    createAlert('HYH Logging Dead', 'search index=apps', {
      trigger_type: 'number_of_results',
      trigger_condition: 'greater_than',
      trigger_threshold: 0,
      schedule_type: 'cron',
      cron_expression: '*/5 * * * *',
      time_range: '-5m',
      actions: [{ type: 'apprise', config: { channel: 'slack-alerts' } }],
      severity: 'high',
      enabled: true,
    });
    createAlert('Fine alert', 'search index=apps', {
      trigger_type: 'number_of_results',
      trigger_condition: 'greater_than',
      trigger_threshold: 0,
      schedule_type: 'cron',
      cron_expression: '*/5 * * * *',
      time_range: '-5m',
      actions: [{ type: 'apprise', config: { channel: 'LogNog Alerts' } }],
      severity: 'high',
      enabled: true,
    });
  });

  it('judges each app and puts the worst first', async () => {
    const home = await getHomeSummary({ nowMs: now });
    const byName = Object.fromEntries(home.apps.map(a => [a.app_name, a]));
    expect(home.apps.map(a => a.state)).toEqual(['errors', 'quiet', 'quiet', 'new', 'sparse', 'fine']);
    expect(home.apps[0].app_name).toBe('spiky');
    expect(byName.spiky.state).toBe('errors');
    expect(byName.spiky.errors_today).toBe(20);
    expect(byName.sleepy.state).toBe('quiet');
    expect(byName.sleepy.label).toBe('Quiet 5 h');
    expect(byName.steady.state).toBe('fine');
    expect(byName.steady.errors_today).toBe(1);
    // its 4-day outage is its longest gap, but its normal gap is 10 minutes: dead again = quiet
    expect(byName.relapsed.longest_gap_ms).toBeGreaterThanOrEqual(4 * DAY - 20 * MINUTE);
    expect(byName.relapsed.normal_gap_ms).toBe(10 * MINUTE);
    expect(byName.relapsed.state).toBe('quiet');
    expect(byName.relapsed.label).toBe('Quiet 3 days');
    // three hours old: no rhythm yet, so not quiet
    expect(byName.fresh.state).toBe('new');
    // money-watch: a day old but only 2 active minutes, so too few logs to judge, not "New"
    expect(byName['money-watch'].state).toBe('sparse');
    expect(byName['money-watch'].label).toBe('Few logs');
  });

  it('lists what needs you: the broken alert, the spike and the quiet app', async () => {
    const home = await getHomeSummary({ nowMs: now });
    const kinds = home.needs_you.map(i => i.kind + ':' + ('alert_name' in i ? i.alert_name : i.app.app_name));
    expect(kinds).toEqual(['alert_unreachable:HYH Logging Dead', 'error_spike:spiky', 'quiet:sleepy', 'quiet:relapsed']);
    const alert = home.needs_you[0];
    expect(alert.kind === 'alert_unreachable' && alert.problems[0]).toContain('slack-alerts');
  });

  it('shows the latest money-watch snapshot and the logged AI spend', async () => {
    const home = await getHomeSummary({ nowMs: now });
    expect(home.money.bank).toMatchObject({ status: 'ok', out_24h: 12.5, out_7d: 210.25, events: 3 });
    expect(home.money.ai).toMatchObject({ status: 'ok', today: 10.75, week: 12.75, events: 4 });
  });

  it('a key that cannot see the money index gets an honest "not visible", and only its own apps', async () => {
    const home = await getHomeSummary({ nowMs: now, allowedIndexes: ['apps'] });
    expect(home.money.bank.status).toBe('not_visible');
    expect(home.scoped).toBe(true);
    expect(new Set(home.apps.map(a => a.index_name))).toEqual(new Set(['apps']));
  });

  it('a scoped key is not shown alert rules (critic 10-21 #3)', async () => {
    const home = await getHomeSummary({ nowMs: now, allowedIndexes: ['money'] });
    expect(home.alerts_hidden).toBe(true);
    expect(home.needs_you.filter(i => i.kind === 'alert_unreachable')).toEqual([]);
    expect(JSON.stringify(home)).not.toContain('HYH Logging Dead');
    expect((await getHomeSummary({ nowMs: now })).alerts_hidden).toBe(false);
  });

  it('every number opens the logs behind it (drill-downs find the same rows)', async () => {
    const home = await getHomeSummary({ nowMs: Date.now() });
    for (const app of home.apps) {
      expect(await countOf(ui.sourceErrorsQuery(app.index_name, app.app_name), ui.TODAY_EARLIEST)).toBe(app.errors_today);
      expect(await countOf(ui.sourceLogsQuery(app.index_name, app.app_name), ui.TODAY_EARLIEST)).toBe(app.logs_today);
    }
    expect(await countOf(ui.moneySnapshotQuery(), ui.WEEK_EARLIEST)).toBe(2);
    expect(await countOf(ui.aiSpendQuery(), ui.TODAY_EARLIEST)).toBe(3);
    expect(await countOf(ui.aiSpendQuery(), ui.WEEK_EARLIEST)).toBe(home.money.ai.events);
    expect(await countOf(ui.aiSpendQuery('apps', 'spiky'), ui.WEEK_EARLIEST)).toBe(2);
    expect(ui.appErrorsUrl('apps', 'spiky')).toBe('/search?q=search+index%3D%22apps%22+app_name%3D%22spiky%22+severity%3C%3D3&earliest=-24h');
    expect(ui.alertFixUrl('a b')).toBe('/alerts?edit=a+b');
  });

  it('with no money events, says so', async () => {
    const home = await getHomeSummary({ nowMs: now - 20 * DAY });
    expect(home.money.bank.status).toBe('no_events');
    expect(home.money.ai.status).toBe('none');
    expect(home.apps).toEqual([]);
  });
});
