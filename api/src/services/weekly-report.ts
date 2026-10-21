/**
 * The LogNog Weekly: a one-page Friday paper for one ISO week.
 *
 * Sections: the money story, logs / errors / alerts-that-reached-you tiles,
 * every app in words with its trend against last week, what broke, what got
 * fixed (firing -> quiet), and what needs Robert next week.
 *
 * Every number is counted from real rows: log rows (ClickHouse or lite), the
 * alert_history table, and money-watch's `kind=day` events. Like Home, the SQL
 * builders are pure functions per backend; the ClickHouse text is unit-tested
 * (weekly-report.test.ts) and the SQLite text runs against a real lite db.
 *
 * Weeks are ISO weeks (Monday 00:00 to the next Monday 00:00) in the report's
 * time zone (LOGNOG_REPORT_TZ, default America/New_York). A week that is still
 * running ends "now", and last week is cut at the same point so the trend is
 * like-for-like (Mon-Wed vs Mon-Wed).
 */

import { executeRawQuery, getBackend, type Backend } from '../db/backend.js';
import { isIndexAllowed } from '../auth/index-scope.js';
import { getSQLiteDB } from '../db/sqlite.js';
import {
  DAY,
  HOUR,
  MINUTE,
  MONEY_INDEX,
  NORMAL_GAP_RANK,
  homeThresholds,
  timeLiteral,
  timeColumn,
  stringLiteral,
  scopeAnd,
  parseServerTime,
  n,
  round2,
  formatDuration,
  loadAiSpend,
  getHomeSummary,
  type AiSpendApp,
  type NeedsYouItem,
} from './home-summary.js';

export const DEFAULT_REPORT_TZ = 'America/New_York';
/** "Fixed" means nothing for this long at the end of the week. */
export const FIXED_QUIET_MS = 48 * HOUR;
/** Alert actions that stay inside LogNog; every other action type goes out to a person. */
export const LOCAL_ACTION_TYPES = new Set(['log', 'show_on_login']);

export interface WeeklyThresholds {
  /** An error count counts as news from this many errors. */
  minErrors: number;
  /** Errors this week at least this many times last week = "Shaky". */
  errorRise: number;
  /** Went quiet = a silence longer than this many times last week's longest one ... */
  quietMultiplier: number;
  /** ... and never shorter than this. */
  quietFloorMs: number;
}

function numFromEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function weeklyThresholds(): WeeklyThresholds {
  const home = homeThresholds();
  return {
    minErrors: home.spikeMinErrors,
    errorRise: numFromEnv('LOGNOG_WEEKLY_ERROR_RISE', 2),
    quietMultiplier: home.quietMultiplier,
    quietFloorMs: numFromEnv('LOGNOG_WEEKLY_QUIET_FLOOR_MINUTES', 120) * MINUTE,
  };
}

export function reportTimeZone(requested?: unknown): string {
  const tz = typeof requested === 'string' && requested.trim() ? requested.trim() : process.env.LOGNOG_REPORT_TZ || DEFAULT_REPORT_TZ;
  if (!isValidTimeZone(tz)) throw new WeekError('bad_tz', `Unknown time zone: ${tz}`);
  return tz;
}

// ---------------------------------------------------------------------------
// Week math (ISO weeks in a time zone)
// ---------------------------------------------------------------------------

export class WeekError extends Error {
  constructor(public code: 'bad_week' | 'future' | 'bad_tz', message: string) {
    super(message);
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function zonedParts(ms: number, tz: string): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const p: Record<string, string> = {};
  for (const part of partsFormatter(tz).formatToParts(new Date(ms))) p[part.type] = part.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

/** How far the zone's wall clock is ahead of UTC at instant `ms`. */
export function tzOffsetMs(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** The UTC instant of 00:00 local time on a calendar date in `tz` (DST-safe). */
export function zonedMidnight(y: number, m: number, d: number, tz: string): number {
  const wall = Date.UTC(y, m - 1, d);
  const first = wall - tzOffsetMs(wall, tz);
  return wall - tzOffsetMs(first, tz);
}

/** A calendar date as 'YYYY-MM-DD' (from a UTC-midnight date value). */
function dateKey(dateMs: number): string {
  return new Date(dateMs).toISOString().slice(0, 10);
}

/** The local calendar date of an instant, as a UTC-midnight date value. */
function localDate(ms: number, tz: string): number {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d);
}

export function isoWeekOfDate(dateMs: number): { year: number; week: number } {
  const dow = (new Date(dateMs).getUTCDay() + 6) % 7; // Monday = 0
  const thursday = dateMs + (3 - dow) * DAY;
  const year = new Date(thursday).getUTCFullYear();
  const week = 1 + Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * DAY));
  return { year, week };
}

/** Monday of an ISO week, as a UTC-midnight date value. */
export function isoWeekMonday(year: number, week: number): number {
  const jan4 = Date.UTC(year, 0, 4);
  const dow = (new Date(jan4).getUTCDay() + 6) % 7;
  return jan4 - dow * DAY + (week - 1) * 7 * DAY;
}

export function weeksInIsoYear(year: number): number {
  return isoWeekOfDate(Date.UTC(year, 11, 28)).week;
}

export function formatIsoWeek(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function parseIsoWeek(value: string): { year: number; week: number } {
  const m = /^(\d{4})-W(\d{2})$/.exec(value.trim());
  if (!m) throw new WeekError('bad_week', `Week must look like 2026-W43, got "${value}"`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (year < 2000 || year > 2100 || week < 1 || week > weeksInIsoYear(year)) {
    throw new WeekError('bad_week', `${value} is not a week of ${year}`);
  }
  return { year, week };
}

export interface WeekBounds {
  week: string;
  tz: string;
  /** Monday's date, YYYY-MM-DD. */
  monday: string;
  startMs: number;
  /** Next Monday 00:00 local. */
  nextStartMs: number;
  /** min(nextStart, now): a running week ends now. */
  endMs: number;
  complete: boolean;
  prevWeek: string;
  nextWeek: string | null;
  prevStartMs: number;
  /** Last week cut at the same point as this week (like-for-like). */
  prevEndMs: number;
  /** Local dates of this week up to its end, and the same weekdays last week. */
  days: string[];
  prevDays: string[];
}

export function resolveWeek(opts: { week?: string | null; tz: string; nowMs: number }): WeekBounds {
  const { tz, nowMs } = opts;
  const today = localDate(nowMs, tz);
  const target = opts.week ? parseIsoWeek(opts.week) : isoWeekOfDate(today);
  const monday = isoWeekMonday(target.year, target.week);
  const ymd = (dateMs: number) => {
    const d = new Date(dateMs);
    return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()] as const;
  };
  const startMs = zonedMidnight(...ymd(monday), tz);
  if (startMs > nowMs) throw new WeekError('future', `${formatIsoWeek(target.year, target.week)} has not started yet`);
  const nextStartMs = zonedMidnight(...ymd(monday + 7 * DAY), tz);
  const prevStartMs = zonedMidnight(...ymd(monday - 7 * DAY), tz);
  const complete = nextStartMs <= nowMs;
  const endMs = complete ? nextStartMs : nowMs;
  const prevEndMs = complete ? startMs : Math.min(startMs, prevStartMs + (endMs - startMs));
  const lastDay = localDate(endMs - 1, tz);
  const dayCount = Math.min(7, Math.round((lastDay - monday) / DAY) + 1);
  const days: string[] = [];
  const prevDays: string[] = [];
  for (let i = 0; i < dayCount; i++) {
    days.push(dateKey(monday + i * DAY));
    prevDays.push(dateKey(monday + (i - 7) * DAY));
  }
  const prev = isoWeekOfDate(monday - 7 * DAY);
  const next = isoWeekOfDate(monday + 7 * DAY);
  return {
    week: formatIsoWeek(target.year, target.week),
    tz,
    monday: dateKey(monday),
    startMs,
    nextStartMs,
    endMs,
    complete,
    prevWeek: formatIsoWeek(prev.year, prev.week),
    nextWeek: complete ? formatIsoWeek(next.year, next.week) : null,
    prevStartMs,
    prevEndMs,
    days,
    prevDays,
  };
}

const whenFormatters = new Map<string, Intl.DateTimeFormat>();
/** "Tue 3 PM" in the report's zone. */
export function formatWhen(ms: number, tz: string): string {
  let f = whenFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric' });
    whenFormatters.set(tz, f);
  }
  return f.format(new Date(ms)).replace(/\s+/g, ' ');
}

/** "Oct 19" for a YYYY-MM-DD date. */
export function formatDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------------------
// SQL builders
// ---------------------------------------------------------------------------

/** Spans one query needs; all are validated integer ms. */
export interface WeekSpans {
  prevStartMs: number;
  prevEndMs: number;
  startMs: number;
  endMs: number;
  /** end - 48 h: errors and alerts after this decide "fixed". */
  recentMs: number;
}

export function weekSpans(b: WeekBounds): WeekSpans {
  return { prevStartMs: b.prevStartMs, prevEndMs: b.prevEndMs, startMs: b.startMs, endMs: b.endMs, recentMs: b.endMs - FIXED_QUIET_MS };
}

export interface WeeklyAppRow {
  app_name: string;
  index_name: string;
  logs_this: number | string;
  errors_this: number | string;
  logs_prev: number | string;
  errors_prev: number | string;
  logs_prev_full: number | string;
  logs_recent: number | string;
  errors_recent: number | string;
  errors_before: number | string;
  first_seen: string | number | null;
  first_this: string | number | null;
  last_this: string | number | null;
  last_prev: string | number | null;
  last_error: string | number | null;
}

/**
 * One row per (app, index) with logs between last Monday and the end of this
 * week: counts this week and in last week's like-for-like span, plus what the
 * "fixed" rule needs (errors before / in the last 48 h, logs in the last 48 h).
 * Errors are severity <= 3, the Data Sources definition.
 */
export function buildWeeklyAppsSql(backend: Backend, s: WeekSpans, allowedIndexes?: string[] | null): string {
  const prevStart = timeLiteral(backend, s.prevStartMs);
  const prevEnd = timeLiteral(backend, s.prevEndMs);
  const start = timeLiteral(backend, s.startMs);
  const end = timeLiteral(backend, s.endMs);
  const recent = timeLiteral(backend, s.recentMs);
  const scope = scopeAnd(allowedIndexes);
  if (backend === 'clickhouse') {
    // minIf/maxIf on no rows gives 1970-01-01; the loader reads 0 as "none".
    return `SELECT
  COALESCE(app_name, 'unknown') AS app_name,
  COALESCE(index_name, 'main') AS index_name,
  countIf(timestamp >= ${start}) AS logs_this,
  countIf(timestamp >= ${start} AND severity <= 3) AS errors_this,
  countIf(timestamp < ${prevEnd}) AS logs_prev,
  countIf(timestamp < ${prevEnd} AND severity <= 3) AS errors_prev,
  countIf(timestamp < ${start}) AS logs_prev_full,
  countIf(timestamp >= ${recent}) AS logs_recent,
  countIf(timestamp >= ${recent} AND severity <= 3) AS errors_recent,
  countIf(timestamp < ${recent} AND severity <= 3) AS errors_before,
  toUnixTimestamp64Milli(min(timestamp)) AS first_seen,
  toUnixTimestamp64Milli(minIf(timestamp, timestamp >= ${start})) AS first_this,
  toUnixTimestamp64Milli(maxIf(timestamp, timestamp >= ${start})) AS last_this,
  toUnixTimestamp64Milli(maxIf(timestamp, timestamp < ${start})) AS last_prev,
  toUnixTimestamp64Milli(maxIf(timestamp, severity <= 3)) AS last_error
FROM lognog.logs
WHERE timestamp >= ${prevStart} AND timestamp < ${end}${scope}
GROUP BY app_name, index_name
ORDER BY logs_this DESC
LIMIT 200`;
  }
  const ts = timeColumn(backend);
  return `SELECT
  COALESCE(app_name, 'unknown') AS app_name,
  COALESCE(index_name, 'main') AS index_name,
  SUM(CASE WHEN ${ts} >= ${start} THEN 1 ELSE 0 END) AS logs_this,
  SUM(CASE WHEN ${ts} >= ${start} AND severity <= 3 THEN 1 ELSE 0 END) AS errors_this,
  SUM(CASE WHEN ${ts} < ${prevEnd} THEN 1 ELSE 0 END) AS logs_prev,
  SUM(CASE WHEN ${ts} < ${prevEnd} AND severity <= 3 THEN 1 ELSE 0 END) AS errors_prev,
  SUM(CASE WHEN ${ts} < ${start} THEN 1 ELSE 0 END) AS logs_prev_full,
  SUM(CASE WHEN ${ts} >= ${recent} THEN 1 ELSE 0 END) AS logs_recent,
  SUM(CASE WHEN ${ts} >= ${recent} AND severity <= 3 THEN 1 ELSE 0 END) AS errors_recent,
  SUM(CASE WHEN ${ts} < ${recent} AND severity <= 3 THEN 1 ELSE 0 END) AS errors_before,
  MIN(${ts}) AS first_seen,
  MIN(CASE WHEN ${ts} >= ${start} THEN ${ts} END) AS first_this,
  MAX(CASE WHEN ${ts} >= ${start} THEN ${ts} END) AS last_this,
  MAX(CASE WHEN ${ts} < ${start} THEN ${ts} END) AS last_prev,
  MAX(CASE WHEN severity <= 3 THEN ${ts} END) AS last_error
FROM logs
WHERE ${ts} >= ${prevStart} AND ${ts} < ${end}${scope}
GROUP BY COALESCE(app_name, 'unknown'), COALESCE(index_name, 'main')
ORDER BY logs_this DESC
LIMIT 200`;
}

export interface WeeklyGapRow {
  app_name: string;
  index_name: string;
  /** Longest silence between two minutes with logs this week, in seconds ... */
  gap_this_s: number | string;
  /** ... and the minute it began (ms or 'YYYY-MM-DD HH:MM' UTC). */
  gap_this_from: string | number | null;
  /**
   * The app's normal silence last week: its NORMAL_GAP_RANK-th longest gap, so
   * a nightly sleep counts but one outage can't stretch "normal".
   */
  gap_prev_s: number | string;
}

/** Longest silence per app this week (and when it began), and its normal silence in all of last week. */
export function buildWeeklyGapsSql(backend: Backend, s: WeekSpans, allowedIndexes?: string[] | null): string {
  const prevStart = timeLiteral(backend, s.prevStartMs);
  const start = timeLiteral(backend, s.startMs);
  const end = timeLiteral(backend, s.endMs);
  const scope = scopeAnd(allowedIndexes);
  if (backend === 'clickhouse') {
    return `SELECT app_name, index_name,
  if(length(mins_this) > 1, arrayMax(arrayDifference(mins_this)), 0) AS gap_this_s,
  if(length(mins_this) > 1, toInt64(mins_this[indexOf(arrayDifference(mins_this), arrayMax(arrayDifference(mins_this))) - 1]) * 1000, 0) AS gap_this_from,
  if(length(arrayReverseSort(arrayPopFront(arrayDifference(mins_prev))) AS gaps_prev) = 0, 0, gaps_prev[least(${NORMAL_GAP_RANK}, length(gaps_prev))]) AS gap_prev_s
FROM (
  SELECT
    COALESCE(app_name, 'unknown') AS app_name,
    COALESCE(index_name, 'main') AS index_name,
    arraySort(groupUniqArrayIf(toUnixTimestamp(toStartOfMinute(timestamp)), timestamp >= ${start})) AS mins_this,
    arraySort(groupUniqArrayIf(toUnixTimestamp(toStartOfMinute(timestamp)), timestamp < ${start})) AS mins_prev
  FROM lognog.logs
  WHERE timestamp >= ${prevStart} AND timestamp < ${end}${scope}
  GROUP BY app_name, index_name
)
LIMIT 200`;
  }
  const ts = timeColumn(backend);
  // SQLite: SELECT-first nesting (no WITH; the lite executor only returns rows for SELECT).
  return `SELECT app_name, index_name,
  MAX(CASE WHEN wk = 'this' THEN gap_s ELSE 0 END) AS gap_this_s,
  MAX(CASE WHEN wk = 'this' THEN gap_from END) AS gap_this_from,
  MAX(CASE WHEN wk = 'prev' THEN gap_s ELSE 0 END) AS gap_prev_s
FROM (
  SELECT app_name, index_name, wk, gap_s, gap_from FROM (
    SELECT app_name, index_name, wk, prev AS gap_from,
      CAST(ROUND((julianday(m) - julianday(prev)) * 86400) AS INTEGER) AS gap_s,
      ROW_NUMBER() OVER (PARTITION BY app_name, index_name, wk ORDER BY julianday(m) - julianday(prev) DESC, m) AS rn,
      COUNT(*) OVER (PARTITION BY app_name, index_name, wk) AS gap_count
    FROM (
      SELECT app_name, index_name, wk, m, LAG(m) OVER (PARTITION BY app_name, index_name, wk ORDER BY m) AS prev
      FROM (
        SELECT DISTINCT COALESCE(app_name, 'unknown') AS app_name, COALESCE(index_name, 'main') AS index_name,
          CASE WHEN ${ts} >= ${start} THEN 'this' ELSE 'prev' END AS wk,
          substr(${ts}, 1, 16) AS m
        FROM logs
        WHERE ${ts} >= ${prevStart} AND ${ts} < ${end}${scope}
      )
    )
    WHERE prev IS NOT NULL
  )
  WHERE (wk = 'this' AND rn = 1) OR (wk = 'prev' AND rn = MIN(${NORMAL_GAP_RANK}, gap_count))
)
GROUP BY app_name, index_name
LIMIT 200`;
}

export interface WeeklyErrorGroupRow {
  app_name: string;
  index_name: string;
  message: string;
  errors_this: number | string;
  errors_prev: number | string;
  errors_recent: number | string;
  errors_before: number | string;
  last_at: string | number | null;
}

/** Error messages (exact text, severity <= 3) per app, this week vs last week's like-for-like span. */
export function buildWeeklyErrorGroupsSql(backend: Backend, s: WeekSpans, allowedIndexes?: string[] | null): string {
  const prevStart = timeLiteral(backend, s.prevStartMs);
  const prevEnd = timeLiteral(backend, s.prevEndMs);
  const start = timeLiteral(backend, s.startMs);
  const end = timeLiteral(backend, s.endMs);
  const recent = timeLiteral(backend, s.recentMs);
  const scope = scopeAnd(allowedIndexes);
  if (backend === 'clickhouse') {
    return `SELECT
  COALESCE(app_name, 'unknown') AS app_name,
  COALESCE(index_name, 'main') AS index_name,
  message,
  countIf(timestamp >= ${start}) AS errors_this,
  countIf(timestamp < ${prevEnd}) AS errors_prev,
  countIf(timestamp >= ${recent}) AS errors_recent,
  countIf(timestamp < ${recent}) AS errors_before,
  toUnixTimestamp64Milli(max(timestamp)) AS last_at
FROM lognog.logs
WHERE timestamp >= ${prevStart} AND timestamp < ${end} AND severity <= 3${scope}
GROUP BY app_name, index_name, message
ORDER BY errors_this + errors_prev DESC
LIMIT 100`;
  }
  const ts = timeColumn(backend);
  return `SELECT
  COALESCE(app_name, 'unknown') AS app_name,
  COALESCE(index_name, 'main') AS index_name,
  message,
  SUM(CASE WHEN ${ts} >= ${start} THEN 1 ELSE 0 END) AS errors_this,
  SUM(CASE WHEN ${ts} < ${prevEnd} THEN 1 ELSE 0 END) AS errors_prev,
  SUM(CASE WHEN ${ts} >= ${recent} THEN 1 ELSE 0 END) AS errors_recent,
  SUM(CASE WHEN ${ts} < ${recent} THEN 1 ELSE 0 END) AS errors_before,
  MAX(${ts}) AS last_at
FROM logs
WHERE ${ts} >= ${prevStart} AND ${ts} < ${end} AND severity <= 3${scope}
GROUP BY COALESCE(app_name, 'unknown'), COALESCE(index_name, 'main'), message
ORDER BY SUM(CASE WHEN ${ts} >= ${start} THEN 1 ELSE 0 END) + SUM(CASE WHEN ${ts} < ${prevEnd} THEN 1 ELSE 0 END) DESC
LIMIT 100`;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * money-watch's per-day spend: `kind=day` events carry `day` (local date) and
 * `out`. The tool re-sends the last 14 days on every run, so the newest row
 * for each day wins.
 */
export function buildMoneyDaysSql(backend: Backend, days: string[], fromMs: number, nowMs: number): string {
  for (const d of days) if (!DAY_RE.test(d)) throw new Error(`Bad day: ${d}`);
  if (days.length === 0) throw new Error('No days');
  const list = days.map(stringLiteral).join(', ');
  const from = timeLiteral(backend, fromMs);
  const now = timeLiteral(backend, nowMs);
  const idx = stringLiteral(MONEY_INDEX);
  if (backend === 'clickhouse') {
    // The inner column is day_out, not out: ClickHouse swaps an alias in for a
    // same-named column, so `argMax(out, ...) AS out` plus `WHERE out ...` puts an
    // aggregate inside WHERE (ILLEGAL_AGGREGATION) and argMax inside itself.
    return `SELECT day, argMax(day_out, timestamp) AS out
FROM (
  SELECT JSONExtractString(structured_data, 'day') AS day,
    toFloat64OrNull(if(JSONType(structured_data, 'out') = 'String', JSONExtractString(structured_data, 'out'), JSONExtractRaw(structured_data, 'out'))) AS day_out,
    timestamp
  FROM lognog.logs
  WHERE index_name = ${idx} AND timestamp >= ${from} AND timestamp <= ${now}
    AND JSONExtractString(structured_data, 'kind') = 'day'
)
WHERE day IN (${list}) AND day_out IS NOT NULL
GROUP BY day
ORDER BY day`;
  }
  const ts = timeColumn(backend);
  return `SELECT day, out FROM (
  SELECT day, out, ROW_NUMBER() OVER (PARTITION BY day ORDER BY t DESC) AS rn
  FROM (
    SELECT json_extract(structured_data, '$.day') AS day,
      CAST(json_extract(structured_data, '$.out') AS REAL) AS out,
      ${ts} AS t
    FROM logs
    WHERE index_name = ${idx} AND ${ts} >= ${from} AND ${ts} <= ${now}
      AND json_valid(structured_data) AND json_extract(structured_data, '$.kind') = 'day'
  )
  WHERE day IN (${list}) AND out IS NOT NULL
)
WHERE rn = 1
ORDER BY day`;
}

// ---------------------------------------------------------------------------
// Judging the week
// ---------------------------------------------------------------------------

export type WeeklyAppState = 'shaky' | 'quiet' | 'silent' | 'new' | 'fine';

export interface WeeklyApp {
  app_name: string;
  index_name: string;
  state: WeeklyAppState;
  logs_this: number;
  logs_prev: number;
  logs_change_pct: number | null;
  errors_this: number;
  errors_prev: number;
  errors_change_pct: number | null;
  /** The longest silence this week when it counts as "went quiet". */
  quiet: { from: string; to: string | null; ms: number } | null;
  last_seen: string | null;
  /** The app's week in one line of plain words. */
  words: string;
}

function ms0(v: unknown): number | null {
  const t = parseServerTime(v);
  return t === null || t <= 0 ? null : t;
}

export function changePct(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

function trendWords(pct: number | null): string {
  if (pct === null) return '';
  if (pct === 0) return 'same as last week';
  return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% on last week`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

export function assessWeeklyApp(
  row: WeeklyAppRow,
  gap: WeeklyGapRow | undefined,
  b: WeekBounds,
  t: WeeklyThresholds,
): WeeklyApp {
  const logsThis = n(row.logs_this);
  const logsPrev = n(row.logs_prev);
  const logsPrevFull = n(row.logs_prev_full);
  const errorsThis = n(row.errors_this);
  const errorsPrev = n(row.errors_prev);
  const firstThis = ms0(row.first_this);
  const lastThis = ms0(row.last_this);
  const lastPrev = ms0(row.last_prev);
  const lastSeen = lastThis ?? lastPrev;
  const base = {
    app_name: row.app_name,
    index_name: row.index_name,
    logs_this: logsThis,
    logs_prev: logsPrev,
    logs_change_pct: changePct(logsThis, logsPrev),
    errors_this: errorsThis,
    errors_prev: errorsPrev,
    errors_change_pct: changePct(errorsThis, errorsPrev),
    quiet: null as WeeklyApp['quiet'],
    last_seen: lastSeen === null ? null : new Date(lastSeen).toISOString(),
  };

  if (logsThis === 0) {
    const when = lastPrev ? ` (last log ${formatWhen(lastPrev, b.tz)})` : '';
    return { ...base, state: 'silent', words: `Silent all week${when}` };
  }
  if (logsPrevFull === 0) {
    return { ...base, state: 'new', words: `New this week · ${plural(logsThis, 'log')}` };
  }
  // Too little history before Monday to know its rhythm: don't call it quiet.
  const firstSeen = ms0(row.first_seen);
  if (firstSeen === null || lastPrev === null || lastPrev - firstSeen < DAY) {
    return { ...base, state: 'new', words: `Started late last week · ${plural(logsThis, 'log')} this week` };
  }

  // Longest silence: inside the week, across Monday (from last week's last log), or still going at the end.
  const candidates: Array<{ from: number; to: number | null; ms: number }> = [];
  const gapThis = n(gap?.gap_this_s) * 1000;
  const gapFrom = ms0(gap?.gap_this_from);
  if (gapThis > 0 && gapFrom !== null) candidates.push({ from: gapFrom, to: gapFrom + gapThis, ms: gapThis });
  if (firstThis !== null && lastPrev !== null) candidates.push({ from: lastPrev, to: firstThis, ms: firstThis - lastPrev });
  if (lastThis !== null) candidates.push({ from: lastThis, to: null, ms: b.endMs - lastThis });
  const longest = candidates.sort((a, c) => c.ms - a.ms)[0];
  const normal = n(gap?.gap_prev_s) * 1000;
  const quietLimit = Math.max(t.quietFloorMs, t.quietMultiplier * normal);

  const rising =
    errorsThis >= t.minErrors && (errorsPrev === 0 || errorsThis >= t.errorRise * errorsPrev) && n(row.errors_recent) > 0;
  if (rising) {
    const was = errorsPrev === 0 ? 'none in the same days last week' : `up from ${errorsPrev.toLocaleString('en-US')} last week`;
    return { ...base, state: 'shaky', words: `Shaky · ${plural(errorsThis, 'error')}, ${was}` };
  }
  if (longest && longest.ms > quietLimit) {
    const quiet = {
      from: new Date(longest.from).toISOString(),
      to: longest.to === null ? null : new Date(longest.to).toISOString(),
      ms: longest.ms,
    };
    const span =
      longest.to === null
        ? `since ${formatWhen(longest.from, b.tz)}, still quiet`
        : `${formatWhen(longest.from, b.tz)} – ${formatWhen(longest.to, b.tz)}`;
    return { ...base, state: 'quiet', quiet, words: `Went quiet · ${formatDuration(longest.ms)}, ${span}` };
  }
  const trend = trendWords(base.logs_change_pct);
  const errs = errorsThis > 0 ? `, ${plural(errorsThis, 'error')}` : ', no errors';
  return { ...base, state: 'fine', words: `Fine · ${plural(logsThis, 'log')}${trend ? ` (${trend})` : ''}${errs}` };
}

const WEEKLY_ORDER: Record<WeeklyAppState, number> = { shaky: 0, quiet: 1, silent: 2, new: 3, fine: 4 };

export function sortWeeklyApps(apps: WeeklyApp[]): WeeklyApp[] {
  return [...apps].sort(
    (a, b) =>
      WEEKLY_ORDER[a.state] - WEEKLY_ORDER[b.state] ||
      b.errors_this - a.errors_this ||
      b.logs_this - a.logs_this ||
      a.app_name.localeCompare(b.app_name),
  );
}

// ---------------------------------------------------------------------------
// Alerts (lite metadata db: alert_history)
// ---------------------------------------------------------------------------

export interface AlertFiring {
  alert_id: string;
  alert_name: string;
  at: number;
  severity: string;
  /** No outward action (only log / login banner): it could not reach anyone. */
  outward: boolean;
  reached: boolean;
}

interface ActionResult {
  type?: string;
  success?: boolean;
}

export function judgeFiring(actionsJson: string | null): { outward: boolean; reached: boolean } {
  let actions: ActionResult[] = [];
  try {
    const parsed = JSON.parse(actionsJson || '[]');
    actions = Array.isArray(parsed) ? parsed : [];
  } catch {
    actions = [];
  }
  const outward = actions.filter(a => a && typeof a.type === 'string' && !LOCAL_ACTION_TYPES.has(a.type));
  return { outward: outward.length > 0, reached: outward.some(a => a.success === true) };
}

export function loadAlertFirings(fromMs: number, toMs: number): AlertFiring[] {
  // alert_history.triggered_at is SQLite datetime('now'): 'YYYY-MM-DD HH:MM:SS' UTC.
  // Pull a day of slack on both sides as text, then compare exact instants in JS.
  const lo = new Date(fromMs - DAY).toISOString().replace('T', ' ').slice(0, 19);
  const rows = getSQLiteDB()
    .prepare(
      `SELECT h.alert_id AS alert_id, COALESCE(a.name, 'Deleted alert') AS alert_name, h.triggered_at AS triggered_at,
         h.severity AS severity, h.actions_executed AS actions_executed
       FROM alert_history h LEFT JOIN alerts a ON a.id = h.alert_id
       WHERE h.triggered_at >= ?
       ORDER BY h.triggered_at`,
    )
    .all(lo) as Array<{ alert_id: string; alert_name: string; triggered_at: string; severity: string; actions_executed: string | null }>;
  const out: AlertFiring[] = [];
  for (const r of rows) {
    const at = parseServerTime(r.triggered_at);
    if (at === null || at < fromMs || at >= toMs) continue;
    out.push({ alert_id: r.alert_id, alert_name: r.alert_name, at, severity: r.severity, ...judgeFiring(r.actions_executed) });
  }
  return out;
}

export interface AlertTile {
  fired: number;
  reached: number;
  /** Fired, tried to reach you, and every outward try failed. */
  lost: number;
  /** Fired with nowhere to send (log / login banner only). */
  no_route: number;
  fired_prev: number;
}

export function alertTile(firings: AlertFiring[], s: WeekSpans): AlertTile {
  const thisWeek = firings.filter(f => f.at >= s.startMs && f.at < s.endMs);
  return {
    fired: thisWeek.length,
    reached: thisWeek.filter(f => f.reached).length,
    lost: thisWeek.filter(f => f.outward && !f.reached).length,
    no_route: thisWeek.filter(f => !f.outward).length,
    fired_prev: firings.filter(f => f.at >= s.prevStartMs && f.at < s.prevEndMs).length,
  };
}

// ---------------------------------------------------------------------------
// What broke / what got fixed
// ---------------------------------------------------------------------------

export type BrokeItem =
  | {
      kind: 'app_errors';
      app_name: string;
      index_name: string;
      errors_this: number;
      errors_prev: number;
      top_message: string | null;
      top_count: number;
      words: string;
    }
  | {
      kind: 'new_error';
      app_name: string;
      index_name: string;
      message: string;
      errors_this: number;
      words: string;
    }
  | { kind: 'app_quiet'; app_name: string; index_name: string; quiet: NonNullable<WeeklyApp['quiet']>; words: string }
  | { kind: 'app_silent'; app_name: string; index_name: string; words: string }
  | {
      kind: 'alert_fired';
      alert_id: string;
      alert_name: string;
      fired: number;
      reached: number;
      lost: number;
      no_route: number;
      last_at: string;
      words: string;
    };

export type FixedItem =
  | { kind: 'app_errors_stopped'; app_name: string; index_name: string; errors_before: number; last_error: string; words: string }
  | {
      kind: 'error_stopped';
      app_name: string;
      index_name: string;
      message: string;
      errors_before: number;
      last_at: string;
      words: string;
    }
  | { kind: 'alert_quiet'; alert_id: string; alert_name: string; fired_before: number; last_at: string; words: string };

function shortMessage(message: string, max = 90): string {
  const m = message.replace(/\s+/g, ' ').trim();
  return m.length > max ? `${m.slice(0, max - 1)}…` : m;
}

export function judgeWeek(input: {
  bounds: WeekBounds;
  apps: WeeklyApp[];
  appRows: WeeklyAppRow[];
  groups: WeeklyErrorGroupRow[];
  firings: AlertFiring[];
  thresholds: WeeklyThresholds;
}): { broke: BrokeItem[]; fixed: FixedItem[] } {
  const { bounds: b, apps, appRows, groups, firings, thresholds: t } = input;
  const s = weekSpans(b);
  const broke: BrokeItem[] = [];
  const fixed: FixedItem[] = [];
  const key = (app: string, idx: string) => `${idx}\u0000${app}`;
  const rowsByApp = new Map(appRows.map(r => [key(r.app_name, r.index_name), r]));
  const shakyApps = new Set<string>();

  // Apps whose errors rose, with their most common error.
  for (const app of apps) {
    const k = key(app.app_name, app.index_name);
    if (app.state === 'shaky') {
      shakyApps.add(k);
      const top = groups
        .filter(g => key(g.app_name, g.index_name) === k && n(g.errors_this) > 0)
        .sort((a, c) => n(c.errors_this) - n(a.errors_this))[0];
      broke.push({
        kind: 'app_errors',
        app_name: app.app_name,
        index_name: app.index_name,
        errors_this: app.errors_this,
        errors_prev: app.errors_prev,
        top_message: top ? top.message : null,
        top_count: top ? n(top.errors_this) : 0,
        words:
          `${app.app_name}: ${plural(app.errors_this, 'error')}` +
          (app.errors_prev === 0 ? ', none the same days last week' : `, up from ${app.errors_prev.toLocaleString('en-US')}`) +
          (top ? `. Most were "${shortMessage(top.message)}" (${n(top.errors_this).toLocaleString('en-US')})` : ''),
      });
    }
  }

  // A new error (none last week) in an app that isn't already listed, still happening.
  for (const g of groups) {
    const k = key(g.app_name, g.index_name);
    if (shakyApps.has(k)) continue;
    if (n(g.errors_prev) === 0 && n(g.errors_this) >= t.minErrors && n(g.errors_recent) > 0) {
      broke.push({
        kind: 'new_error',
        app_name: g.app_name,
        index_name: g.index_name,
        message: g.message,
        errors_this: n(g.errors_this),
        words: `${g.app_name}: a new error, "${shortMessage(g.message)}", ${plural(n(g.errors_this), 'time')} this week`,
      });
    }
  }

  for (const app of apps) {
    if (app.state === 'quiet' && app.quiet) {
      broke.push({ kind: 'app_quiet', app_name: app.app_name, index_name: app.index_name, quiet: app.quiet, words: `${app.app_name}: ${app.words.replace(/^Went quiet · /, 'went quiet for ')}` });
    }
    if (app.state === 'silent') {
      broke.push({ kind: 'app_silent', app_name: app.app_name, index_name: app.index_name, words: `${app.app_name}: ${app.words.replace(/^Silent/, 'silent')}` });
    }
  }

  // Alerts: firing earlier but quiet for the last 48 h = fixed; otherwise firing this week = broke.
  const byAlert = new Map<string, AlertFiring[]>();
  for (const f of firings) {
    if (f.at < s.prevStartMs || f.at >= s.endMs) continue;
    const list = byAlert.get(f.alert_id) ?? [];
    list.push(f);
    byAlert.set(f.alert_id, list);
  }
  for (const [alertId, list] of byAlert) {
    const recent = list.filter(f => f.at >= s.recentMs);
    const before = list.filter(f => f.at < s.recentMs);
    const thisWeek = list.filter(f => f.at >= s.startMs);
    const last = list[list.length - 1];
    if (recent.length === 0 && before.length > 0) {
      fixed.push({
        kind: 'alert_quiet',
        alert_id: alertId,
        alert_name: last.alert_name,
        fired_before: before.length,
        last_at: new Date(last.at).toISOString(),
        words: `${last.alert_name}: fired ${plural(before.length, 'time')}, quiet since ${formatWhen(last.at, b.tz)}`,
      });
    } else if (thisWeek.length > 0) {
      const reached = thisWeek.filter(f => f.reached).length;
      const lost = thisWeek.filter(f => f.outward && !f.reached).length;
      const noRoute = thisWeek.filter(f => !f.outward).length;
      const delivery =
        lost > 0
          ? `${lost} never reached you`
          : noRoute > 0
            ? `${noRoute} had nowhere to send`
            : reached === thisWeek.length
              ? 'every one reached you'
              : '';
      broke.push({
        kind: 'alert_fired',
        alert_id: alertId,
        alert_name: last.alert_name,
        fired: thisWeek.length,
        reached,
        lost,
        no_route: noRoute,
        last_at: new Date(last.at).toISOString(),
        words: `Alert "${last.alert_name}" fired ${plural(thisWeek.length, 'time')}${delivery ? `; ${delivery}` : ''}. Last ${formatWhen(last.at, b.tz)}`,
      });
    }
  }

  // Apps whose errors stopped: some before the last 48 h, none since, while the app kept logging.
  const stoppedApps = new Set<string>();
  for (const r of appRows) {
    const lastError = ms0(r.last_error);
    if (n(r.errors_before) >= t.minErrors && n(r.errors_recent) === 0 && n(r.logs_recent) > 0 && lastError !== null) {
      stoppedApps.add(key(r.app_name, r.index_name));
      fixed.push({
        kind: 'app_errors_stopped',
        app_name: r.app_name,
        index_name: r.index_name,
        errors_before: n(r.errors_before),
        last_error: new Date(lastError).toISOString(),
        words: `${r.app_name}: errors stopped. ${plural(n(r.errors_before), 'error')} before, none since ${formatWhen(lastError, b.tz)}`,
      });
    }
  }
  // Single error messages that stopped, in apps that kept logging (and aren't already listed).
  for (const g of groups) {
    const k = key(g.app_name, g.index_name);
    const row = rowsByApp.get(k);
    const lastAt = ms0(g.last_at);
    if (stoppedApps.has(k) || !row || lastAt === null) continue;
    if (n(g.errors_before) >= t.minErrors && n(g.errors_recent) === 0 && n(row.logs_recent) > 0) {
      fixed.push({
        kind: 'error_stopped',
        app_name: g.app_name,
        index_name: g.index_name,
        message: g.message,
        errors_before: n(g.errors_before),
        last_at: new Date(lastAt).toISOString(),
        words: `${g.app_name}: "${shortMessage(g.message)}" stopped. ${plural(n(g.errors_before), 'time')} before, none since ${formatWhen(lastAt, b.tz)}`,
      });
    }
  }
  return { broke, fixed };
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export interface WeeklyBank {
  index: string;
  /** ok | no `kind=day` totals for these dates | the caller's key can't see the money index */
  status: 'ok' | 'no_days' | 'not_visible';
  this_week: number | null;
  last_week: number | null;
  change_pct: number | null;
  days_counted: number;
  days_prev_counted: number;
  days: Array<{ day: string; out: number }>;
  biggest_day: { day: string; out: number } | null;
}

export async function loadWeeklyBank(b: WeekBounds, nowMs: number, allowedIndexes?: string[] | null): Promise<WeeklyBank> {
  const empty: WeeklyBank = {
    index: MONEY_INDEX,
    status: 'no_days',
    this_week: null,
    last_week: null,
    change_pct: null,
    days_counted: 0,
    days_prev_counted: 0,
    days: [],
    biggest_day: null,
  };
  if (!isIndexAllowed(allowedIndexes, MONEY_INDEX)) return { ...empty, status: 'not_visible' };
  const rows = await executeRawQuery<{ day: string; out: number | string }>(
    buildMoneyDaysSql(getBackend(), [...b.prevDays, ...b.days], b.prevStartMs - DAY, nowMs),
  );
  const byDay = new Map(rows.map(r => [String(r.day), round2(n(r.out))]));
  const days = b.days.filter(d => byDay.has(d)).map(d => ({ day: d, out: byDay.get(d)! }));
  const prev = b.prevDays.filter(d => byDay.has(d)).map(d => byDay.get(d)!);
  if (days.length === 0 && prev.length === 0) return empty;
  const thisWeek = days.length ? round2(days.reduce((sum, d) => sum + d.out, 0)) : null;
  const lastWeek = prev.length ? round2(prev.reduce((sum, v) => sum + v, 0)) : null;
  const biggest = days.length ? days.reduce((a, c) => (c.out > a.out ? c : a)) : null;
  return {
    ...empty,
    status: days.length ? 'ok' : 'no_days',
    this_week: thisWeek,
    last_week: lastWeek,
    change_pct: thisWeek !== null && lastWeek !== null ? changePct(thisWeek, lastWeek) : null,
    days_counted: days.length,
    days_prev_counted: prev.length,
    days,
    biggest_day: biggest,
  };
}

export interface WeeklyAi {
  field: string;
  status: 'ok' | 'none';
  this_week: number;
  last_week: number;
  change_pct: number | null;
  events: number;
  by_app: AiSpendApp[];
}

// ---------------------------------------------------------------------------
// The whole paper
// ---------------------------------------------------------------------------

export interface WeeklyReport {
  week: string;
  tz: string;
  label: string;
  monday: string;
  start: string;
  end: string;
  complete: boolean;
  prev_week: string;
  next_week: string | null;
  /** Search bounds for this week and last week's like-for-like span (latest is inclusive, so end - 1 ms). */
  range: { earliest: string; latest: string };
  prev_range: { earliest: string; latest: string };
  generated_at: string;
  backend: Backend;
  scoped: boolean;
  /** The indexes a scoped key can read (null when it reads all). */
  scope_indexes: string[] | null;
  /** True for a scoped key: alerts aren't tied to an index, so none are counted or named. */
  alerts_hidden: boolean;
  thresholds: WeeklyThresholds;
  money: { bank: WeeklyBank; ai: WeeklyAi };
  tiles: {
    logs: { this_week: number; last_week: number; change_pct: number | null };
    errors: { this_week: number; last_week: number; change_pct: number | null };
    alerts: AlertTile;
  };
  apps: WeeklyApp[];
  broke: BrokeItem[];
  fixed: FixedItem[];
  needs_you: NeedsYouItem[];
  needs_you_as_of: string;
  /** The paper's lead headline, built from the first thing that broke (or the lack of one). */
  headline: string;
  spoken: string;
}

export function weekLabel(b: WeekBounds): string {
  const first = b.monday;
  const lastDate = new Date(Date.parse(`${b.monday}T00:00:00Z`) + 6 * DAY).toISOString().slice(0, 10);
  const a = formatDay(first);
  const z = formatDay(lastDate);
  const sameMonth = a.split(' ')[0] === z.split(' ')[0];
  return `The week of ${a} – ${sameMonth ? z.split(' ')[1] : z}`;
}

function money$(v: number): string {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function spokenPct(pct: number | null, noun = 'last week'): string {
  if (pct === null) return '';
  if (pct === 0) return `, the same as ${noun}`;
  return `, ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)} percent on ${noun}`;
}

/** The lead headline: the first thing that broke, in a few words; never made up. */
export function headlineFor(r: Pick<WeeklyReport, 'apps' | 'broke' | 'fixed' | 'complete'>): string {
  if (r.apps.length === 0) return r.complete ? 'No logs arrived this week' : 'No logs yet this week';
  const top = r.broke[0];
  if (!top) {
    const fixed = r.fixed.length ? `, and ${r.fixed.length === 1 ? 'one thing' : `${r.fixed.length} things`} got fixed` : '';
    return `A quiet week: nothing broke${fixed}`;
  }
  let main: string;
  switch (top.kind) {
    case 'app_errors':
      main = `${top.app_name} had a rough week: ${plural(top.errors_this, 'error')}`;
      break;
    case 'new_error':
      main = `A new error in ${top.app_name}, ${plural(top.errors_this, 'time')}`;
      break;
    case 'app_quiet':
      main = `${top.app_name} went quiet for ${formatDuration(top.quiet.ms)}`;
      break;
    case 'app_silent':
      main = `${top.app_name} sent nothing all week`;
      break;
    case 'alert_fired':
      main = `Alert "${top.alert_name}" fired ${plural(top.fired, 'time')}`;
      break;
  }
  const more = r.broke.length - 1;
  return more > 0 ? `${main}, and ${more === 1 ? 'one more thing' : `${more} more things`} broke` : main;
}

/** The paper read aloud: what the read-aloud button and the Friday voice note say. */
export function spokenText(r: Omit<WeeklyReport, 'spoken'>): string {
  const parts: string[] = [];
  parts.push(`The LogNog Weekly. ${r.label}${r.complete ? '' : ', so far'}. ${r.headline}.`);
  const bank = r.money.bank;
  if (bank.status === 'ok' && bank.this_week !== null) {
    parts.push(
      `Money: the bank shows ${money$(bank.this_week)} out over ${plural(bank.days_counted, 'day')}` +
        (bank.last_week !== null ? `, against ${money$(bank.last_week)} the same days last week.` : '.'),
    );
  } else if (bank.status === 'not_visible') {
    parts.push('Money: this key cannot see the money index.');
  } else {
    parts.push('Money: no bank day totals arrived for this week.');
  }
  if (r.money.ai.status === 'ok') parts.push(`Logged AI spend was ${money$(r.money.ai.this_week)}.`);
  const tl = r.tiles;
  parts.push(`${plural(tl.logs.this_week, 'log')}${spokenPct(tl.logs.change_pct)}.`);
  parts.push(`${plural(tl.errors.this_week, 'error')}${spokenPct(tl.errors.change_pct)}.`);
  if (r.alerts_hidden) parts.push('Alerts are not shown to this login.');
  else if (tl.alerts.fired === 0) parts.push('No alerts fired.');
  else {
    const missed = tl.alerts.fired - tl.alerts.reached;
    parts.push(
      `${plural(tl.alerts.fired, 'alert')} fired, ${tl.alerts.reached} reached you` + (missed > 0 ? `, ${missed} did not.` : ', none lost.'),
    );
  }
  const notFine = r.apps.filter(a => a.state !== 'fine');
  const fine = r.apps.length - notFine.length;
  parts.push(
    `Apps: ${fine} of ${r.apps.length} fine.` + (notFine.length ? ' ' + notFine.map(a => `${a.app_name}, ${a.words.split(' · ')[0].toLowerCase()}.`).join(' ') : ''),
  );
  if (r.broke.length) parts.push(`What broke: ${r.broke.map(i => i.words.replace(/"/g, '')).join('. ')}.`);
  else parts.push('Nothing broke.');
  if (r.fixed.length) parts.push(`What got fixed: ${r.fixed.map(i => i.words.replace(/"/g, '')).join('. ')}.`);
  if (r.needs_you.length) {
    const words = r.needs_you.map(item =>
      item.kind === 'alert_unreachable'
        ? `the alert ${item.alert_name} can't reach you`
        : item.kind === 'error_spike'
          ? `${item.app.app_name} has an error spike`
          : `${item.app.app_name} has gone quiet`,
    );
    parts.push(`Needs you next week: ${words.join('; ')}.`);
  } else parts.push('Nothing needs you right now.');
  return parts.join(' ').replace(/\.\./g, '.');
}

export async function getWeeklyReport(opts: {
  week?: string | null;
  tz?: string | null;
  nowMs?: number;
  allowedIndexes?: string[] | null;
}): Promise<WeeklyReport> {
  const nowMs = opts.nowMs ?? Date.now();
  const tz = reportTimeZone(opts.tz ?? undefined);
  const allowed = opts.allowedIndexes ?? null;
  const b = resolveWeek({ week: opts.week, tz, nowMs });
  const s = weekSpans(b);
  const backend = getBackend();
  const t = weeklyThresholds();

  const [appRows, gapRows, groups, bank, aiThis, aiPrev, home] = await Promise.all([
    executeRawQuery<WeeklyAppRow>(buildWeeklyAppsSql(backend, s, allowed)),
    executeRawQuery<WeeklyGapRow>(buildWeeklyGapsSql(backend, s, allowed)),
    executeRawQuery<WeeklyErrorGroupRow>(buildWeeklyErrorGroupsSql(backend, s, allowed)),
    loadWeeklyBank(b, nowMs, allowed),
    loadAiSpend(s.startMs, s.endMs, s.startMs, allowed),
    loadAiSpend(s.prevStartMs, s.prevEndMs, s.prevStartMs, allowed),
    getHomeSummary({ nowMs, allowedIndexes: allowed }),
  ]);
  const gaps = new Map(gapRows.map(g => [`${g.index_name}\u0000${g.app_name}`, g]));
  const apps = sortWeeklyApps(appRows.map(r => assessWeeklyApp(r, gaps.get(`${r.index_name}\u0000${r.app_name}`), b, t)));
  // Alert rules aren't tied to one index, so a scoped key isn't shown any (same rule as Home).
  const scoped = Array.isArray(allowed) && allowed.length > 0;
  const firings = scoped ? [] : loadAlertFirings(s.prevStartMs, s.endMs);
  const { broke, fixed } = judgeWeek({ bounds: b, apps, appRows, groups, firings, thresholds: t });

  const logsThis = appRows.reduce((sum, r) => sum + n(r.logs_this), 0);
  const logsPrev = appRows.reduce((sum, r) => sum + n(r.logs_prev), 0);
  const errorsThis = appRows.reduce((sum, r) => sum + n(r.errors_this), 0);
  const errorsPrev = appRows.reduce((sum, r) => sum + n(r.errors_prev), 0);

  const report: Omit<WeeklyReport, 'spoken'> = {
    week: b.week,
    tz,
    label: weekLabel(b),
    monday: b.monday,
    start: new Date(b.startMs).toISOString(),
    end: new Date(b.endMs).toISOString(),
    complete: b.complete,
    prev_week: b.prevWeek,
    next_week: b.nextWeek,
    range: { earliest: new Date(b.startMs).toISOString(), latest: new Date(b.endMs - 1).toISOString() },
    prev_range: { earliest: new Date(b.prevStartMs).toISOString(), latest: new Date(b.prevEndMs - 1).toISOString() },
    generated_at: new Date(nowMs).toISOString(),
    backend,
    scoped,
    scope_indexes: scoped ? [...(allowed as string[])] : null,
    alerts_hidden: scoped,
    thresholds: t,
    money: {
      bank,
      ai: {
        field: aiThis.field,
        status: aiThis.events > 0 ? 'ok' : 'none',
        this_week: aiThis.week,
        last_week: aiPrev.week,
        change_pct: aiPrev.events > 0 ? changePct(aiThis.week, aiPrev.week) : null,
        events: aiThis.events,
        by_app: aiThis.by_app,
      },
    },
    tiles: {
      logs: { this_week: logsThis, last_week: logsPrev, change_pct: changePct(logsThis, logsPrev) },
      errors: { this_week: errorsThis, last_week: errorsPrev, change_pct: changePct(errorsThis, errorsPrev) },
      alerts: alertTile(firings, s),
    },
    apps,
    broke,
    fixed,
    needs_you: home.needs_you,
    needs_you_as_of: home.generated_at,
    headline: '',
  };
  report.headline = headlineFor(report);
  return { ...report, spoken: spokenText(report) };
}
