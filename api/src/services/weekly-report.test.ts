/**
 * The LogNog Weekly (GET /api/reports/weekly).
 *
 * - Week math: ISO weeks in the report's time zone, DST weeks, year ends, a
 *   running week compared like-for-like with the same days last week.
 * - ClickHouse: the live server runs ClickHouse, which isn't available in the
 *   test run, so its SQL is checked as text.
 * - SQLite (lite): the whole paper is built from a real lite db with seeded
 *   logs and alert_history rows at a fixed "now", and the paper's drill-down
 *   queries (ui/src/utils/weeklyDrilldown.ts) run through the real DSL engine
 *   to prove each number opens the rows behind it.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

process.env.LOGNOG_BACKEND = 'sqlite';
process.env.LOGS_DB_PATH = join(
  tmpdir(),
  `lognog-weekly-test-${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}.db`,
);

import { insertLogs, executeDSLQuery } from '../db/backend.js';
import { createAlert, createNotificationChannel, getSQLiteDB } from '../db/sqlite.js';
import { DAY, HOUR, MINUTE } from './home-summary.js';
import { parseRelativeTimeSQLite } from '../dsl/compiler-sqlite.js';
import {
  parseIsoWeek,
  weeksInIsoYear,
  resolveWeek,
  reportTimeZone,
  WeekError,
  weekSpans,
  weekLabel,
  formatWhen,
  buildWeeklyAppsSql,
  buildWeeklyGapsSql,
  buildWeeklyErrorGroupsSql,
  buildMoneyDaysSql,
  buildWeeklyTotalsSql,
  assessWeeklyApp,
  judgeFiring,
  alertTile,
  changePct,
  getWeeklyReport,
  headlineFor,
  weeklyThresholds,
  type WeeklyAppRow,
  type WeeklyGapRow,
  type AlertFiring,
} from './weekly-report.js';

const NY = 'America/New_York';
// Friday 2026-10-23 13:00 UTC = 9 AM in New York, when the Friday paper goes out.
const NOW = Date.UTC(2026, 9, 23, 13, 0, 0);
const utc = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);

function weekError(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof WeekError) return e.code;
    throw e;
  }
  return 'no error';
}

describe('ISO weeks in the report time zone', () => {
  it('reads 2026-W43 and refuses anything else', () => {
    expect(parseIsoWeek('2026-W43')).toEqual({ year: 2026, week: 43 });
    expect(weekError(() => parseIsoWeek('2026-43'))).toBe('bad_week');
    expect(weekError(() => parseIsoWeek('2026-W00'))).toBe('bad_week');
    expect(weekError(() => parseIsoWeek('2027-W53'))).toBe('bad_week');
    expect(weekError(() => parseIsoWeek("2026-W43' OR 1=1"))).toBe('bad_week');
  });

  it('knows 2026 has 53 weeks and 2027-W01 starts Monday Jan 4', () => {
    expect(weeksInIsoYear(2026)).toBe(53);
    expect(weeksInIsoYear(2027)).toBe(52);
    const b = resolveWeek({ week: '2027-W01', tz: NY, nowMs: utc(2027, 2, 1) });
    expect(b.monday).toBe('2027-01-04');
    expect(b.prevWeek).toBe('2026-W53');
    expect(b.startMs).toBe(utc(2027, 1, 4, 5));
  });

  it('a running week ends now and is compared with the same days last week', () => {
    const b = resolveWeek({ tz: NY, nowMs: utc(2026, 10, 21, 15) }); // Wed 11 AM ET
    expect(b.week).toBe('2026-W43');
    expect(b.startMs).toBe(utc(2026, 10, 19, 4)); // Monday 00:00 EDT
    expect(b.endMs).toBe(utc(2026, 10, 21, 15));
    expect(b.complete).toBe(false);
    expect(b.nextWeek).toBeNull();
    expect(b.prevStartMs).toBe(utc(2026, 10, 12, 4));
    expect(b.prevEndMs).toBe(utc(2026, 10, 14, 15)); // last Wednesday 11 AM
    expect(b.days).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
    expect(b.prevDays).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
    expect(weekLabel(b)).toBe('The week of Oct 19 – 25');
  });

  it('a finished week runs Monday to Monday, across the clocks going back', () => {
    const b = resolveWeek({ week: '2026-W44', tz: NY, nowMs: utc(2026, 11, 10) });
    expect(b.startMs).toBe(utc(2026, 10, 26, 4)); // EDT
    expect(b.endMs).toBe(utc(2026, 11, 2, 5)); // EST: a 169-hour week
    expect(b.complete).toBe(true);
    expect(b.nextWeek).toBe('2026-W45');
    expect(b.prevEndMs).toBe(b.startMs);
    expect(b.days).toHaveLength(7);
    expect(weekLabel(b)).toBe('The week of Oct 26 – Nov 1');
    const spring = resolveWeek({ week: '2026-W11', tz: NY, nowMs: utc(2026, 4, 1) });
    expect(spring.startMs).toBe(utc(2026, 3, 9, 4)); // Mon Mar 9 is already EDT (clocks went forward Sun Mar 8)
    const w10 = resolveWeek({ week: '2026-W10', tz: NY, nowMs: utc(2026, 4, 1) });
    expect(w10.startMs).toBe(utc(2026, 3, 2, 5));
    expect(w10.endMs).toBe(utc(2026, 3, 9, 4)); // a 167-hour week
  });

  it('a week that has not started, or an unknown zone, is an error', () => {
    expect(weekError(() => resolveWeek({ week: '2026-W44', tz: NY, nowMs: NOW }))).toBe('future');
    expect(weekError(() => reportTimeZone('Mars/Olympus'))).toBe('bad_tz');
    expect(reportTimeZone(undefined)).toBe(process.env.LOGNOG_REPORT_TZ || NY);
  });
});

describe('last week\'s cut-off across a clock change', () => {
  it('uses the same local wall-clock time 7 days back, not the same elapsed hours', () => {
    // Sun Nov 1 2026, 12 PM EST (clocks went back at 2 AM). The same time last
    // Sunday was 12 PM EDT = 16:00 UTC; an elapsed-time cut-off would say 17:00 UTC.
    const b = resolveWeek({ tz: NY, nowMs: utc(2026, 11, 1, 17) });
    expect(b.week).toBe('2026-W44');
    expect(new Date(b.prevEndMs).toISOString()).toBe('2026-10-25T16:00:00.000Z');
    // An ordinary week is unchanged: Friday 9 AM back to last Friday 9 AM.
    const f = resolveWeek({ tz: NY, nowMs: NOW });
    expect(new Date(f.prevEndMs).toISOString()).toBe('2026-10-16T13:00:00.000Z');
  });
});

describe('ClickHouse SQL builders (live backend)', () => {
  const s = weekSpans(resolveWeek({ tz: NY, nowMs: NOW }));
  const t = (ms: number) => `fromUnixTimestamp64Milli(toInt64(${ms}))`;

  it('counts this week, last week like-for-like, and the last 48 h by instants', () => {
    const sql = buildWeeklyAppsSql('clickhouse', s);
    expect(sql).toContain(`countIf(timestamp >= ${t(s.startMs)}) AS logs_this`);
    expect(sql).toContain(`countIf(timestamp >= ${t(s.startMs)} AND severity <= 3) AS errors_this`);
    expect(sql).toContain(`countIf(timestamp < ${t(s.prevEndMs)} AND severity <= 3) AS errors_prev`);
    expect(sql).toContain(`countIf(timestamp >= ${t(s.recentMs)} AND severity <= 3) AS errors_recent`);
    expect(sql).toContain(`WHERE timestamp >= ${t(s.prevStartMs)} AND timestamp < ${t(s.endMs)}\nGROUP BY app_name, index_name`);
    expect(sql).toContain('FROM lognog.logs');
    expect(sql).not.toMatch(/now\(\)|datetime\('now'|INTERVAL/);
  });

  it('ANDs a scoped key\'s indexes into every query', () => {
    const scope = "AND index_name IN ('uptime','o''brien')";
    expect(buildWeeklyAppsSql('clickhouse', s, ['Uptime', "o'brien"])).toContain(scope);
    expect(buildWeeklyGapsSql('clickhouse', s, ['Uptime', "o'brien"])).toContain(scope);
    expect(buildWeeklyErrorGroupsSql('clickhouse', s, ['Uptime', "o'brien"])).toContain(`severity <= 3 ${scope}`);
    expect(buildWeeklyAppsSql('clickhouse', s, null)).not.toContain('IN (');
  });

  it('takes last week\'s normal silence as its 3rd-longest gap', () => {
    const sql = buildWeeklyGapsSql('clickhouse', s);
    expect(sql).toContain(
      'if(length(arrayReverseSort(arrayPopFront(arrayDifference(mins_prev))) AS gaps_prev) = 0, 0, gaps_prev[least(3, length(gaps_prev))]) AS gap_prev_s',
    );
    expect(sql).toContain('if(length(mins_this) > 1, arrayMax(arrayDifference(mins_this)), 0) AS gap_this_s');
    expect(sql).toContain(`groupUniqArrayIf(toUnixTimestamp(toStartOfMinute(timestamp)), timestamp >= ${t(s.startMs)})) AS mins_this`);
  });

  it('counts the tiles over every app, not just the 200 the app list shows', () => {
    const sql = buildWeeklyTotalsSql('clickhouse', s, ['hyh']);
    expect(sql).toContain(`countIf(timestamp >= ${t(s.startMs)} AND severity <= 3) AS errors_this`);
    expect(sql).toContain(`countIf(timestamp < ${t(s.prevEndMs)}) AS logs_prev`);
    expect(sql).toContain("AND index_name IN ('hyh')");
    expect(sql).not.toMatch(/LIMIT|GROUP BY/);
    expect(buildWeeklyTotalsSql('sqlite', s)).not.toMatch(/LIMIT|GROUP BY/);
  });

  it('groups errors by exact message', () => {
    const sql = buildWeeklyErrorGroupsSql('clickhouse', s);
    expect(sql).toContain('GROUP BY app_name, index_name, message');
    expect(sql).toContain('LIMIT 100');
  });

  it('reads money-watch day totals, newest row per day, and refuses odd days', () => {
    const sql = buildMoneyDaysSql('clickhouse', ['2026-10-19', '2026-10-20'], s.prevStartMs, NOW);
    expect(sql).toContain('argMax(day_out, timestamp) AS out');
    expect(sql).toContain("WHERE index_name = 'money'");
    expect(sql).toContain("JSONExtractString(structured_data, 'kind') = 'day'");
    expect(sql).toContain("WHERE day IN ('2026-10-19', '2026-10-20') AND day_out IS NOT NULL");
    expect(() => buildMoneyDaysSql('clickhouse', ["2026-10-19'; DROP"], 0, NOW)).toThrow();
    expect(() => buildMoneyDaysSql('clickhouse', [], 0, NOW)).toThrow();
  });

  // ClickHouse replaces a column with a same-named alias everywhere in the
  // query level, so an aggregate alias that shares a name used in its own
  // argument or in a WHERE turns into ILLEGAL_AGGREGATION / a cyclic alias.
  it('never names an aggregate after something its own expression or a WHERE reads', () => {
    const AGG = /\b(count|countIf|sum|sumIf|min|minIf|max|maxIf|argMax|groupUniqArray|groupUniqArrayIf)\(/;
    const sqls = {
      apps: buildWeeklyAppsSql('clickhouse', s, ['hyh']),
      gaps: buildWeeklyGapsSql('clickhouse', s, ['hyh']),
      errors: buildWeeklyErrorGroupsSql('clickhouse', s, ['hyh']),
      totals: buildWeeklyTotalsSql('clickhouse', s, ['hyh']),
      money: buildMoneyDaysSql('clickhouse', ['2026-10-19'], s.prevStartMs, NOW),
    };
    for (const [name, sql] of Object.entries(sqls)) {
      const wheres = [...sql.matchAll(/\bWHERE\b([\s\S]*?)(?=\bGROUP BY\b|\bORDER BY\b|\bLIMIT\b|\)\s*$|$)/g)].map(m => m[1]);
      let aggregates = 0;
      for (const line of sql.split('\n')) {
        const m = line.match(/^(.*)\bAS (\w+),?\s*$/);
        if (!m || !AGG.test(m[1])) continue;
        aggregates++;
        const alias = new RegExp(`\\b${m[2]}\\b`);
        expect(alias.test(m[1]), `${name}: ${m[2]} reads itself`).toBe(false);
        for (const w of wheres) expect(alias.test(w), `${name}: ${m[2]} used in a WHERE`).toBe(false);
      }
      expect(aggregates, `${name} has aggregates to check`).toBeGreaterThan(0);
    }
  });
});

describe('judging an app\'s week', () => {
  const b = resolveWeek({ tz: NY, nowMs: NOW });
  const th = { minErrors: 5, errorRise: 2, quietMultiplier: 2, quietFloorMs: 120 * MINUTE };
  const row = (p: Partial<WeeklyAppRow>): WeeklyAppRow => ({
    app_name: 'app',
    index_name: 'apps',
    logs_this: 1000,
    errors_this: 0,
    logs_prev: 900,
    errors_prev: 0,
    logs_prev_full: 1400,
    logs_recent: 400,
    errors_recent: 0,
    errors_before: 0,
    first_seen: b.prevStartMs,
    first_this: b.startMs + MINUTE,
    last_this: NOW - 5 * MINUTE,
    last_prev: b.startMs - 5 * MINUTE,
    last_error: null,
    ...p,
  });
  const gap = (p: Partial<WeeklyGapRow>): WeeklyGapRow => ({
    app_name: 'app',
    index_name: 'apps',
    gap_this_s: 600,
    gap_this_from: b.startMs + DAY,
    gap_prev_s: 600,
    ...p,
  });

  it('a steady week is fine, with its trend in words', () => {
    const a = assessWeeklyApp(row({ errors_this: 3 }), gap({}), b, th);
    expect(a.state).toBe('fine');
    expect(a.logs_change_pct).toBe(11);
    expect(a.words).toBe('Fine · 1,000 logs (up 11% on last week), 3 errors');
  });

  it('errors from nothing, still coming, are shaky', () => {
    const a = assessWeeklyApp(row({ errors_this: 12, errors_recent: 4 }), gap({}), b, th);
    expect(a.state).toBe('shaky');
    expect(a.words).toBe('Shaky · 12 errors, none in the same days last week');
    expect(assessWeeklyApp(row({ errors_this: 12, errors_prev: 10, errors_recent: 4 }), gap({}), b, th).state).toBe('fine');
    expect(assessWeeklyApp(row({ errors_this: 12, errors_prev: 6, errors_recent: 4 }), gap({}), b, th).words).toBe(
      'Shaky · 12 errors, up from 6 last week',
    );
    // errors that already stopped are "fixed", not shaky
    expect(assessWeeklyApp(row({ errors_this: 12, errors_recent: 0 }), gap({}), b, th).state).toBe('fine');
  });

  it('a silence far past its normal is "went quiet", with when', () => {
    const from = utc(2026, 10, 20, 11, 50);
    const a = assessWeeklyApp(row({}), gap({ gap_this_s: 36 * 3600, gap_this_from: from }), b, th);
    expect(a.state).toBe('quiet');
    expect(a.quiet).toEqual({ from: new Date(from).toISOString(), to: new Date(from + 36 * HOUR).toISOString(), ms: 36 * HOUR });
    expect(a.words).toBe(`Went quiet · 36 h, ${formatWhen(from, NY)} – ${formatWhen(from + 36 * HOUR, NY)}`);
  });

  it('one long outage last week does not stretch "normal" (its normal is the 3rd-longest gap)', () => {
    // gap_prev_s is already the 3rd-longest: 10 min. A 5 h silence this week is news.
    const a = assessWeeklyApp(row({}), gap({ gap_this_s: 5 * 3600, gap_prev_s: 600 }), b, th);
    expect(a.state).toBe('quiet');
    // a nightly 6 h sleep IS its rhythm: the same 5 h silence is fine
    expect(assessWeeklyApp(row({}), gap({ gap_this_s: 5 * 3600, gap_prev_s: 6 * 3600 }), b, th).state).toBe('fine');
  });

  it('still silent at the end of the week counts as quiet', () => {
    const last = NOW - 30 * HOUR;
    const a = assessWeeklyApp(row({ last_this: last }), gap({}), b, th);
    expect(a.state).toBe('quiet');
    expect(a.quiet?.to).toBeNull();
    expect(a.words).toBe(`Went quiet · 30 h, since ${formatWhen(last, NY)}, still quiet`);
  });

  it('no logs all week is silent; no logs before Monday is new; under a day of history is new', () => {
    const silent = assessWeeklyApp(row({ logs_this: 0, first_this: null, last_this: null }), undefined, b, th);
    expect(silent.state).toBe('silent');
    expect(silent.words).toBe(`Silent all week (last log ${formatWhen(b.startMs - 5 * MINUTE, NY, true)})`);
    expect(assessWeeklyApp(row({ logs_prev_full: 0, logs_prev: 0, last_prev: null }), undefined, b, th).words).toBe(
      'New this week · 1,000 logs',
    );
    const late = assessWeeklyApp(row({ first_seen: b.startMs - 3 * HOUR, last_this: NOW - 40 * HOUR }), gap({}), b, th);
    expect(late.state).toBe('new');
    expect(late.words).toBe('Started late last week · 1,000 logs this week');
  });

  it('ClickHouse "no rows" times (0) read as none', () => {
    const a = assessWeeklyApp(row({ logs_this: 0, first_this: '0', last_this: '0' }), undefined, b, th);
    expect(a.state).toBe('silent');
    expect(a.last_seen).toBe(new Date(b.startMs - 5 * MINUTE).toISOString());
  });

  it('change in percent needs something to compare with', () => {
    expect(changePct(5, 0)).toBeNull();
    expect(changePct(50, 100)).toBe(-50);
  });
});

describe('alert delivery', () => {
  it('reached = any outward action succeeded; log / login banner only = nowhere to send', () => {
    expect(judgeFiring('[{"type":"apprise","success":true}]')).toEqual({ outward: true, reached: true });
    expect(judgeFiring('[{"type":"apprise","success":false},{"type":"log","success":true}]')).toEqual({ outward: true, reached: false });
    expect(judgeFiring('[{"type":"show_on_login","success":true}]')).toEqual({ outward: false, reached: false });
    expect(judgeFiring('not json')).toEqual({ outward: false, reached: false });
    expect(judgeFiring(null)).toEqual({ outward: false, reached: false });
  });

  it('the tile counts this week and last week\'s same days', () => {
    const s = weekSpans(resolveWeek({ tz: NY, nowMs: NOW }));
    const f = (at: number, outward: boolean, reached: boolean): AlertFiring => ({
      alert_id: 'a', alert_name: 'A', at, severity: 'high', outward, reached,
    });
    const tile = alertTile(
      [f(s.startMs, true, true), f(s.startMs + HOUR, true, false), f(NOW - 1, false, false), f(s.prevStartMs, true, true), f(s.prevEndMs, true, true)],
      s,
    );
    expect(tile).toEqual({ fired: 3, reached: 1, lost: 1, no_route: 1, fired_prev: 1 });
  });
});

// ---------------------------------------------------------------------------
// The whole paper on a real lite db
// ---------------------------------------------------------------------------

interface WeeklyDrill {
  allLogsQuery(): string;
  allErrorsQuery(): string;
  errorMessageQuery(i: string, a: string, m: string): string;
  moneyDaysQuery(): string;
  sourceLogsQuery(i: string, a: string): string;
  sourceErrorsQuery(i: string, a: string): string;
  aiSpendQuery(i?: string, a?: string): string;
  spanUrl(q: string, span: { earliest: string; latest: string }): string;
  ALERT_HISTORY_URL: string;
}
const UI_MODULE = resolve(__dirname, '../../../ui/src/utils/weeklyDrilldown.ts');

async function countIn(query: string, span: { earliest: string; latest: string }, allowedIndexes?: string[]): Promise<number> {
  const { results } = await executeDSLQuery<{ count: number }>(`${query} | stats count`, { ...span, allowedIndexes });
  return Number(results[0]?.count ?? 0);
}

describe('the headline', () => {
  const app = { app_name: 'a' } as never;
  it('is built only from what happened', () => {
    expect(headlineFor({ apps: [], broke: [], fixed: [], complete: false })).toBe('No logs yet this week');
    expect(headlineFor({ apps: [app], broke: [], fixed: [], complete: true })).toBe('A quiet week: nothing broke');
    expect(
      headlineFor({ apps: [app], broke: [], fixed: [{ kind: 'alert_quiet' } as never, { kind: 'alert_quiet' } as never], complete: true }),
    ).toBe('A quiet week: nothing broke, and 2 things got fixed');
    expect(
      headlineFor({
        apps: [app],
        broke: [{ kind: 'alert_fired', alert_name: 'Disk full', fired: 1 } as never, { kind: 'app_silent', app_name: 'x' } as never],
        fixed: [],
        complete: true,
      }),
    ).toBe('Alert "Disk full" fired 1 time, and one more thing broke');
    expect(
      headlineFor({ apps: [app], broke: [{ kind: 'app_quiet', app_name: 'uptime', quiet: { ms: 3 * HOUR } } as never], fixed: [], complete: true }),
    ).toBe('uptime went quiet for 3 h');
  });
});

describe('The LogNog Weekly on the lite (SQLite) backend', () => {
  let ui: WeeklyDrill;
  const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '');
  const FROM = utc(2026, 10, 5);

  beforeAll(async () => {
    ui = (await import(/* @vite-ignore */ UI_MODULE)) as WeeklyDrill;
    const rows: Record<string, unknown>[] = [];
    const add = (index_name: string, app_name: string, severity: number, at: number, message: string, extra: Record<string, unknown> = {}) =>
      rows.push({
        timestamp: iso(at),
        index_name,
        app_name,
        hostname: 'h',
        severity,
        message,
        structured_data: JSON.stringify({ message, ...extra }),
      });
    const every = (stepMs: number, from: number, to: number, fn: (at: number) => void) => {
      for (let at = from; at < to; at += stepMs) fn(at);
    };

    // steady: every 30 min, one error a day at 03:00 UTC
    every(30 * MINUTE, FROM, NOW - 10 * MINUTE, at =>
      add('apps', 'steady', new Date(at).getUTCHours() === 3 && new Date(at).getUTCMinutes() === 0 ? 3 : 6, at,
        new Date(at).getUTCHours() === 3 && new Date(at).getUTCMinutes() === 0 ? 'nightly sync slow' : 'page view'));
    // shaky: every 30 min, clean until a new error starts Thursday (12 of them, still coming)
    every(30 * MINUTE, FROM + 5 * MINUTE, NOW, at => add('apps', 'shaky', 6, at, 'match created'));
    for (let i = 0; i < 12; i++) add('apps', 'shaky', 3, utc(2026, 10, 22, i, 7), 'worker crashed: out of memory');
    // hyh: every 30 min; a scrape error every 2 h from 9 days to 3 days ago, then none (fixed)
    every(30 * MINUTE, FROM + 10 * MINUTE, NOW, at => add('hyh', 'hyh', 6, at, 'resume parsed'));
    every(2 * HOUR, NOW - 9 * DAY, NOW - 3 * DAY, at => add('hyh', 'hyh', 3, at, 'JobSpy scrape failed: 503'));
    // went-quiet: every 10 min, but nothing from Tue 11:50 to Thu 00:00 UTC
    every(10 * MINUTE, FROM, NOW, at => {
      if (at > utc(2026, 10, 20, 11, 50) && at < utc(2026, 10, 22)) return;
      add('apps', 'went-quiet', 6, at, 'tick');
    });
    // gone: every 30 min until last Friday 19:30 UTC, then nothing
    every(30 * MINUTE, FROM, utc(2026, 10, 16, 19, 31), at => add('apps', 'gone', 6, at, 'uptime ok'));
    // newbie: started Thursday
    every(15 * MINUTE, utc(2026, 10, 22, 10), NOW, at => add('apps', 'newbie', 6, at, 'synthetic check passed'));
    // money-watch's own heartbeat (it logs every run)
    every(HOUR, FROM, NOW - 20 * MINUTE, at => add('money', 'money-watch', 6, at, 'balance checked'));
    // money-watch shaped day totals (fake amounts): last week 10..50, this week 11/22/33/44;
    // Oct 20 was first sent as 999 and later re-sent as 22 (the newest row wins)
    const prevOut = [10, 20, 30, 40, 50];
    for (let i = 0; i < 5; i++) {
      add('money', 'money-watch', 6, utc(2026, 10, 13 + i, 5), 'money day total', { kind: 'day', day: `2026-10-${12 + i}`, out: prevOut[i] });
    }
    add('money', 'money-watch', 6, utc(2026, 10, 20, 6), 'money day total', { kind: 'day', day: '2026-10-20', out: 999 });
    const thisOut = [11, 22, 33, 44];
    for (let i = 0; i < 4; i++) {
      add('money', 'money-watch', 6, utc(2026, 10, 20 + i, 5), 'money day total', { kind: 'day', day: `2026-10-${19 + i}`, out: thisOut[i] });
    }
    // AI spend: 0.50 + 1.25 this week (and a zero that doesn't count), 3.00 in last week's same days
    add('apps', 'steady', 6, utc(2026, 10, 20, 15), 'image generated', { cost_usd: 0.5 });
    add('apps', 'steady', 6, utc(2026, 10, 22, 15), 'image generated', { cost_usd: 1.25 });
    add('apps', 'steady', 6, utc(2026, 10, 22, 16), 'image generated', { cost_usd: 0 });
    add('apps', 'steady', 6, utc(2026, 10, 14, 15), 'image generated', { cost_usd: 3 });
    await insertLogs(rows);

    createNotificationChannel('LogNog Alerts', 'email', 'mailto://robert@example.invalid');
    const rule = (name: string, channel: string) =>
      createAlert(name, 'search index=apps', {
        trigger_type: 'number_of_results',
        trigger_condition: 'greater_than',
        trigger_threshold: 0,
        schedule_type: 'cron',
        cron_expression: '0 * * * *',
        time_range: '-1h',
        actions: [{ type: 'apprise', config: { channel } }],
        severity: 'high',
        enabled: true,
      }).id;
    const money = rule('Money watch errors', 'LogNog Alerts');
    const knuckle = rule('Knuckle Up box overloaded', 'LogNog Alerts');
    const hyh = rule('HYH Logging Dead', 'slack-alerts');
    const banner = rule('Login banner only', 'LogNog Alerts');
    const fire = getSQLiteDB().prepare(
      `INSERT INTO alert_history (id, alert_id, triggered_at, result_count, severity, actions_executed) VALUES (?, ?, ?, 1, 'high', ?)`,
    );
    const at = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
    const ok = JSON.stringify([{ type: 'apprise', success: true, message: 'sent' }]);
    const failed = JSON.stringify([{ type: 'apprise', success: false, message: 'Channel not found: slack-alerts' }]);
    const local = JSON.stringify([{ type: 'show_on_login', success: true }]);
    // Money: fired last week (twice) and Monday, quiet since = fixed
    for (const t of [utc(2026, 10, 14, 10), utc(2026, 10, 15, 10), utc(2026, 10, 19, 10)]) fire.run(randomUUID(), money, at(t), ok);
    // Knuckle Up: hourly for the last 6 hours, every one delivered
    for (let i = 1; i <= 6; i++) fire.run(randomUUID(), knuckle, at(NOW - i * HOUR), ok);
    // HYH: twice this week, never delivered
    for (const t of [utc(2026, 10, 22, 8), utc(2026, 10, 22, 20)]) fire.run(randomUUID(), hyh, at(t), failed);
    // a login-banner-only firing: nowhere to send
    fire.run(randomUUID(), banner, at(utc(2026, 10, 23, 10)), local);
    // Old trouble: fired last Tue + Wed only, so it was fixed in last week's paper, not this one.
    const old = rule('Old trouble', 'LogNog Alerts');
    for (const t of [utc(2026, 10, 13, 10), utc(2026, 10, 14, 10)]) fire.run(randomUUID(), old, at(t), ok);
    // Weekend blip: fired last Saturday morning; its 48 h of quiet ended this Monday = fixed this week.
    const blip = rule('Weekend blip', 'LogNog Alerts');
    fire.run(randomUUID(), blip, at(utc(2026, 10, 17, 12)), ok);
    // a firing next week and one three weeks ago don't count
    fire.run(randomUUID(), knuckle, at(utc(2026, 10, 27)), ok);
    fire.run(randomUUID(), knuckle, at(utc(2026, 10, 1)), ok);
  });

  it('dates the paper and compares like-for-like', async () => {
    const r = await getWeeklyReport({ nowMs: NOW, tz: NY });
    expect(r.week).toBe('2026-W43');
    expect(r.label).toBe('The week of Oct 19 – 25');
    expect(r.complete).toBe(false);
    expect(r.range).toEqual({ earliest: '2026-10-19T04:00:00.000Z', latest: '2026-10-23T12:59:59.999Z' });
    expect(r.prev_range).toEqual({ earliest: '2026-10-12T04:00:00.000Z', latest: '2026-10-16T12:59:59.999Z' });
    expect(r.backend).toBe('sqlite');
    expect(r.thresholds).toEqual(weeklyThresholds());
  });

  it('tells the money story from money-watch day totals (newest row per day)', async () => {
    const { bank, ai } = (await getWeeklyReport({ nowMs: NOW, tz: NY })).money;
    expect(bank).toMatchObject({
      status: 'ok',
      this_week: 110,
      last_week: 150,
      change_pct: -27,
      days_counted: 4,
      days_prev_counted: 5,
      biggest_day: { day: '2026-10-22', out: 44 },
    });
    expect(bank.days.map(d => d.out)).toEqual([11, 22, 33, 44]);
    expect(ai).toMatchObject({ status: 'ok', this_week: 1.75, last_week: 3, change_pct: -42, events: 2 });
  });

  it('judges every app in words, worst first', async () => {
    const r = await getWeeklyReport({ nowMs: NOW, tz: NY });
    const by = Object.fromEntries(r.apps.map(a => [a.app_name, a]));
    expect(r.apps.map(a => `${a.app_name}:${a.state}`)).toEqual([
      'shaky:shaky',
      'went-quiet:quiet',
      'gone:silent',
      'newbie:new',
      'hyh:fine',
      'steady:fine',
      'money-watch:fine',
    ]);
    expect(by.shaky.words).toBe('Shaky · 12 errors, none in the same days last week');
    expect(by['went-quiet'].words).toBe('Went quiet · 36 h, Tue 7 AM – Wed 8 PM');
    expect(by.gone.words).toBe('Silent all week (last log Fri, Oct 16, 3 PM)');
    expect(by.newbie.words).toMatch(/^New this week · \d+ logs$/);
    expect(by.steady.words).toMatch(/^Fine · [\d,]+ logs \(.+ last week\), 4 errors$/);
    expect(by.steady.errors_prev).toBe(4);
  });

  it('says what broke and what got fixed', async () => {
    const r = await getWeeklyReport({ nowMs: NOW, tz: NY });
    expect(r.broke.map(i => i.kind)).toEqual(['app_errors', 'app_quiet', 'app_silent', 'alert_fired', 'alert_fired', 'alert_fired']);
    expect(r.broke[0]).toMatchObject({ app_name: 'shaky', top_message: 'worker crashed: out of memory', top_count: 12 });
    expect(r.broke[0].words).toBe('shaky: 12 errors, none the same days last week. Most were "worker crashed: out of memory" (12)');
    expect(r.broke[1].words).toBe('went-quiet: went quiet for 36 h, Tue 7 AM – Wed 8 PM');
    expect(r.broke[2].words).toBe('gone: silent all week (last log Fri, Oct 16, 3 PM)');
    expect(r.broke.slice(3).map(i => i.words)).toEqual([
      'Alert "HYH Logging Dead" fired 2 times; 2 never reached you. Last Thu 4 PM',
      'Alert "Knuckle Up box overloaded" fired 6 times; every one reached you. Last Fri 8 AM',
      'Alert "Login banner only" fired 1 time; 1 had nowhere to send. Last Fri 6 AM',
    ]);
    expect(r.fixed.map(i => i.words)).toEqual([
      'Money watch errors: fired 3 times, quiet since Mon 6 AM',
      'Weekend blip: fired 1 time, quiet since Sat, Oct 17, 8 AM',
      `hyh: errors stopped. ${r.fixed[2].kind === 'app_errors_stopped' ? r.fixed[2].errors_before : '?'} errors before, none since Tue 7 AM`,
    ]);
    expect(r.fixed[2]).toMatchObject({ kind: 'app_errors_stopped', app_name: 'hyh' });
  });

  it('lists a fix in one paper only: the week its 48 h of quiet ended', async () => {
    const lastWeek = await getWeeklyReport({ nowMs: NOW, tz: NY, week: '2026-W42' });
    expect(lastWeek.fixed.map(i => i.words)).toContain('Old trouble: fired 2 times, quiet since Wed 6 AM');
    expect(lastWeek.broke.map(i => i.words)).toContain('Alert "Weekend blip" fired 1 time; every one reached you. Last Sat 8 AM');
    const thisWeek = await getWeeklyReport({ nowMs: NOW, tz: NY });
    expect(thisWeek.fixed.map(i => i.words).join('\n')).not.toContain('Old trouble');
    expect(thisWeek.broke.map(i => i.words).join('\n')).not.toContain('Old trouble');
  });

  it('counts the tiles: logs, errors, and alerts that reached Robert', async () => {
    const r = await getWeeklyReport({ nowMs: NOW, tz: NY });
    expect(r.tiles.alerts).toEqual({ fired: 10, reached: 7, lost: 2, no_route: 1, fired_prev: 4 });
    expect(r.tiles.errors.this_week).toBe(r.apps.reduce((s, a) => s + a.errors_this, 0));
    expect(r.tiles.logs.this_week).toBe(r.apps.reduce((s, a) => s + a.logs_this, 0));
    expect(r.tiles.logs.this_week).toBeGreaterThan(1000);
  });

  it('every number opens the logs behind it (drill-downs find the same rows)', async () => {
    const r = await getWeeklyReport({ nowMs: NOW, tz: NY });
    expect(await countIn(ui.allLogsQuery(), r.range)).toBe(r.tiles.logs.this_week);
    expect(await countIn(ui.allLogsQuery(), r.prev_range)).toBe(r.tiles.logs.last_week);
    expect(await countIn(ui.allErrorsQuery(), r.range)).toBe(r.tiles.errors.this_week);
    expect(await countIn(ui.allErrorsQuery(), r.prev_range)).toBe(r.tiles.errors.last_week);
    for (const app of r.apps) {
      expect(await countIn(ui.sourceLogsQuery(app.index_name, app.app_name), r.range)).toBe(app.logs_this);
      expect(await countIn(ui.sourceErrorsQuery(app.index_name, app.app_name), r.range)).toBe(app.errors_this);
      expect(await countIn(ui.sourceLogsQuery(app.index_name, app.app_name), r.prev_range)).toBe(app.logs_prev);
    }
    const top = r.broke[0];
    if (top.kind !== 'app_errors' || !top.top_message) throw new Error('expected the shaky app first');
    expect(await countIn(ui.errorMessageQuery(top.index_name, top.app_name, top.top_message), r.range)).toBe(top.top_count);
    expect(await countIn(ui.aiSpendQuery(), r.range)).toBe(r.money.ai.events);
    // the day-total rows the bank story is added from (one re-sent day = one extra row)
    expect(await countIn(ui.moneyDaysQuery(), r.range)).toBe(r.money.bank.days_counted + 1);
    expect(ui.spanUrl(ui.allErrorsQuery(), r.range)).toBe(
      '/search?q=search+severity%3C%3D3&earliest=2026-10-19T04%3A00%3A00.000Z&latest=2026-10-23T12%3A59%3A59.999Z',
    );
    expect(ui.ALERT_HISTORY_URL).toBe('/alerts?history=all');
  });

  it('a row stored exactly at Monday 00:00 is inside the drill (lite absolute bounds drop the Z)', async () => {
    expect(parseRelativeTimeSQLite('2026-10-19T04:00:00.000Z')).toBe("'2026-10-19 04:00:00.000'");
    const r = await getWeeklyReport({ nowMs: NOW, tz: NY });
    const steady = r.apps.find(a => a.app_name === 'steady')!;
    // steady logs every 30 min from a midnight, so one row sits exactly on the week's first instant
    expect(await countIn(ui.sourceLogsQuery('apps', 'steady'), { earliest: r.range.earliest, latest: r.range.earliest })).toBe(1);
    expect(await countIn(ui.sourceLogsQuery('apps', 'steady'), r.range)).toBe(steady.logs_this);
  });

  it('needs-you comes from Home, as of now', async () => {
    const r = await getWeeklyReport({ nowMs: NOW, tz: NY });
    expect(r.needs_you_as_of).toBe(new Date(NOW).toISOString());
    expect(r.needs_you.map(i => (i.kind === 'alert_unreachable' ? `alert:${i.alert_name}` : `${i.kind}:${i.app.app_name}`))).toContain(
      'alert:HYH Logging Dead',
    );
  });

  it('reads the paper aloud in plain words', async () => {
    const r = await getWeeklyReport({ nowMs: NOW, tz: NY });
    expect(r.headline).toBe('shaky had a rough week: 12 errors, and 5 more things broke');
    expect(r.spoken).toContain('The LogNog Weekly. The week of Oct 19 – 25, so far. shaky had a rough week: 12 errors, and 5 more things broke.');
    expect(r.spoken).toContain('Money: the bank shows $110.00 out over 4 days, against $150.00 the same days last week.');
    expect(r.spoken).toContain('10 alerts fired, 7 reached you, 3 did not.');
    expect(r.spoken).toContain('Apps: 3 of 7 fine.');
    expect(r.spoken).not.toContain('..');
  });

  it('a finished week: the app that stopped on Friday went quiet, still quiet', async () => {
    const r = await getWeeklyReport({ week: '2026-W42', nowMs: NOW, tz: NY });
    expect(r.complete).toBe(true);
    expect(r.next_week).toBe('2026-W43');
    const gone = r.apps.find(a => a.app_name === 'gone');
    expect(gone?.state).toBe('quiet');
    expect(gone?.words).toBe('Went quiet · 2 days, since Fri 3 PM, still quiet');
  });

  it('a scoped key sees only its indexes, no money, and no alerts', async () => {
    const r = await getWeeklyReport({ nowMs: NOW, tz: NY, allowedIndexes: ['hyh'] });
    expect(r.scoped).toBe(true);
    expect(r.alerts_hidden).toBe(true);
    expect(r.scope_indexes).toEqual(['hyh']);
    expect(r.apps.map(a => a.app_name)).toEqual(['hyh']);
    expect(r.money.bank.status).toBe('not_visible');
    expect(r.money.ai.status).toBe('none');
    expect(r.tiles.alerts).toEqual({ fired: 0, reached: 0, lost: 0, no_route: 0, fired_prev: 0 });
    const body = JSON.stringify(r);
    for (const name of ['Money watch errors', 'Knuckle Up', 'HYH Logging Dead', 'Login banner', 'shaky', 'money-watch']) {
      expect(body).not.toContain(name);
    }
    expect(r.spoken).toContain('Alerts are not shown to this login.');
    // the Search page applies the same key scope, so the tile's drill finds the same rows
    expect(await countIn(ui.allLogsQuery(), r.range, ['hyh'])).toBe(r.tiles.logs.this_week);
    expect(await countIn(ui.allErrorsQuery(), r.range, ['hyh'])).toBe(r.tiles.errors.this_week);
  });

  it('a week with nothing in it says so', async () => {
    const r = await getWeeklyReport({ week: '2026-W30', nowMs: NOW, tz: NY });
    expect(r.apps).toEqual([]);
    expect(r.money.bank.status).toBe('no_days');
    expect(r.tiles.logs.this_week).toBe(0);
    expect(r.headline).toBe('No logs arrived this week');
    expect(r.spoken).toContain('Nothing broke.');
  });
});
