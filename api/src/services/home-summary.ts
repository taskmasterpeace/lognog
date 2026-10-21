/**
 * The Home page ("Needs you"): money on top, what needs Robert, every app.
 *
 * Every number here is counted from real log rows. The SQL builders are pure
 * functions (one per backend) so the ClickHouse SQL that runs on the live
 * server is unit-tested as text (home-summary.test.ts) and the SQLite SQL is
 * run against a real lite database.
 *
 * Time bounds are inlined as validated integer literals, never strings from a
 * request: the SQLite executor ignores bound params, so both backends get the
 * same literal style.
 *   - ClickHouse compares DateTime64 instants: fromUnixTimestamp64Milli(toInt64(N))
 *     is the same instant whatever the server's time zone is.
 *   - SQLite stores ISO text without a zone (UTC). The column is normalised to a
 *     space separator, the same way the DSL compiler does (#41-4), and compared
 *     against 'YYYY-MM-DD HH:MM:SS.sss' UTC literals.
 */

import { executeRawQuery, getBackend, type Backend } from '../db/backend.js';
import { indexScopeSqlClause, isIndexAllowed } from '../auth/index-scope.js';
import { getAlerts, getNotificationChannels, type AlertAction } from '../db/sqlite.js';
import { findActionProblems } from './alert-action-problems.js';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** money-watch (studio tool) sends to this index; see ~/octavia/tools/money-watch.py. */
export const MONEY_INDEX = 'money';
/** Any event carrying a numeric cost_usd counts as logged AI spend. */
export const AI_COST_FIELD = 'cost_usd';

/** How far back an app still counts as one of "your apps". */
export const ACTIVITY_WINDOW_MS = 14 * DAY;
/** Today's errors are compared with the average day in the 7 days before. */
export const BASELINE_DAYS = 7;

export interface HomeThresholds {
  /** Errors today must be at least this many times an average day ... */
  spikeMultiplier: number;
  /** ... and at least this many errors, so 2 errors vs 0 isn't a spike. */
  spikeMinErrors: number;
  /** Quiet = silent longer than this many times the app's longest gap in the window ... */
  quietMultiplier: number;
  /** ... and never sooner than this. */
  quietFloorMs: number;
  /** An app needs logs in at least this many separate minutes before it can be called quiet. */
  quietMinActiveMinutes: number;
}

function numFromEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function homeThresholds(): HomeThresholds {
  return {
    spikeMultiplier: numFromEnv('LOGNOG_HOME_SPIKE_MULTIPLIER', 3),
    spikeMinErrors: numFromEnv('LOGNOG_HOME_SPIKE_MIN_ERRORS', 5),
    quietMultiplier: numFromEnv('LOGNOG_HOME_QUIET_MULTIPLIER', 2),
    quietFloorMs: numFromEnv('LOGNOG_HOME_QUIET_FLOOR_MINUTES', 30) * MINUTE,
    quietMinActiveMinutes: 3,
  };
}

// ---------------------------------------------------------------------------
// Literals
// ---------------------------------------------------------------------------

function assertMs(ms: number): number {
  if (!Number.isFinite(ms) || !Number.isInteger(Math.round(ms))) throw new Error(`Bad time: ${ms}`);
  return Math.round(ms);
}

/** A point in time as a SQL literal for the given backend. */
export function timeLiteral(backend: Backend, ms: number): string {
  const t = assertMs(ms);
  if (backend === 'clickhouse') return `fromUnixTimestamp64Milli(toInt64(${t}))`;
  return `'${new Date(t).toISOString().replace('T', ' ').replace('Z', '')}'`;
}

/** The timestamp column in a form the literal compares against. */
export function timeColumn(backend: Backend): string {
  return backend === 'clickhouse' ? 'timestamp' : "replace(timestamp, 'T', ' ')";
}

function stringLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function scopeAnd(allowedIndexes?: string[] | null): string {
  const clause = indexScopeSqlClause(allowedIndexes);
  return clause ? ` AND ${clause}` : '';
}

/** Server time strings carry no zone and are UTC (ingest stores toISOString() minus the Z). */
export function parseServerTime(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  const ms = m ? Date.parse(`${m[1]}T${m[2]}${m[3] ?? 'Z'}`) : Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

// ---------------------------------------------------------------------------
// SQL builders
// ---------------------------------------------------------------------------

export interface AppActivityRow {
  app_name: string;
  index_name: string;
  logs_window: number;
  logs_today: number;
  errors_today: number;
  errors_baseline: number;
  first_seen: string | number;
  last_seen: string | number;
  active_minutes: number;
  longest_gap_s: number;
}

/**
 * One row per (app, index) seen in the last 14 days:
 * logs and errors in the last 24 h, errors in the 7 days before that, first and
 * last log, and the longest silence between two minutes that had logs.
 * Errors are severity <= 3, the same definition as the Data Sources table.
 */
export function buildAppActivitySql(backend: Backend, nowMs: number, allowedIndexes?: string[] | null): string {
  const now = timeLiteral(backend, nowMs);
  const start = timeLiteral(backend, nowMs - ACTIVITY_WINDOW_MS);
  const dayStart = timeLiteral(backend, nowMs - DAY);
  const baseStart = timeLiteral(backend, nowMs - DAY - BASELINE_DAYS * DAY);
  const scope = scopeAnd(allowedIndexes);

  if (backend === 'clickhouse') {
    return `SELECT
  COALESCE(app_name, 'unknown') AS app_name,
  COALESCE(index_name, 'main') AS index_name,
  count() AS logs_window,
  countIf(timestamp >= ${dayStart}) AS logs_today,
  countIf(timestamp >= ${dayStart} AND severity <= 3) AS errors_today,
  countIf(timestamp >= ${baseStart} AND timestamp < ${dayStart} AND severity <= 3) AS errors_baseline,
  toUnixTimestamp64Milli(min(timestamp)) AS first_seen,
  toUnixTimestamp64Milli(max(timestamp)) AS last_seen,
  length(groupUniqArray(toUnixTimestamp(toStartOfMinute(timestamp)))) AS active_minutes,
  arrayMax(arrayDifference(arraySort(groupUniqArray(toUnixTimestamp(toStartOfMinute(timestamp)))))) AS longest_gap_s
FROM lognog.logs
WHERE timestamp >= ${start} AND timestamp <= ${now}${scope}
GROUP BY app_name, index_name
ORDER BY logs_window DESC
LIMIT 200`;
  }

  const ts = timeColumn(backend);
  // SQLite: the executor only returns rows for statements starting with SELECT,
  // so the minute gaps are nested subqueries, not a WITH clause.
  return `SELECT
  a.app_name AS app_name,
  a.index_name AS index_name,
  a.logs_window AS logs_window,
  a.logs_today AS logs_today,
  a.errors_today AS errors_today,
  a.errors_baseline AS errors_baseline,
  a.first_seen AS first_seen,
  a.last_seen AS last_seen,
  COALESCE(g.active_minutes, 0) AS active_minutes,
  COALESCE(g.longest_gap_s, 0) AS longest_gap_s
FROM (
  SELECT
    COALESCE(app_name, 'unknown') AS app_name,
    COALESCE(index_name, 'main') AS index_name,
    COUNT(*) AS logs_window,
    SUM(CASE WHEN ${ts} >= ${dayStart} THEN 1 ELSE 0 END) AS logs_today,
    SUM(CASE WHEN ${ts} >= ${dayStart} AND severity <= 3 THEN 1 ELSE 0 END) AS errors_today,
    SUM(CASE WHEN ${ts} >= ${baseStart} AND ${ts} < ${dayStart} AND severity <= 3 THEN 1 ELSE 0 END) AS errors_baseline,
    MIN(${ts}) AS first_seen,
    MAX(${ts}) AS last_seen
  FROM logs
  WHERE ${ts} >= ${start} AND ${ts} <= ${now}${scope}
  GROUP BY COALESCE(app_name, 'unknown'), COALESCE(index_name, 'main')
) a
LEFT JOIN (
  SELECT app_name, index_name, COUNT(*) AS active_minutes,
    MAX(CASE WHEN prev IS NULL THEN 0 ELSE CAST(ROUND((julianday(m) - julianday(prev)) * 86400) AS INTEGER) END) AS longest_gap_s
  FROM (
    SELECT app_name, index_name, m, LAG(m) OVER (PARTITION BY app_name, index_name ORDER BY m) AS prev
    FROM (
      SELECT DISTINCT COALESCE(app_name, 'unknown') AS app_name, COALESCE(index_name, 'main') AS index_name,
        substr(${ts}, 1, 16) AS m
      FROM logs
      WHERE ${ts} >= ${start} AND ${ts} <= ${now}${scope}
    )
  )
  GROUP BY app_name, index_name
) g ON g.app_name = a.app_name AND g.index_name = a.index_name
ORDER BY a.logs_window DESC
LIMIT 200`;
}

/** Latest money-watch snapshot in the last 14 days, plus how many money events there were. */
export function buildMoneySnapshotSql(backend: Backend, nowMs: number): string {
  const now = timeLiteral(backend, nowMs);
  const start = timeLiteral(backend, nowMs - ACTIVITY_WINDOW_MS);
  const idx = stringLiteral(MONEY_INDEX);
  if (backend === 'clickhouse') {
    return `SELECT
  toUnixTimestamp64Milli(timestamp) AS at,
  JSONExtractFloat(structured_data, 'out_24h') AS out_24h,
  JSONExtractFloat(structured_data, 'out_7d') AS out_7d,
  JSONHas(structured_data, 'out_24h') AS has_24h,
  JSONHas(structured_data, 'out_7d') AS has_7d
FROM lognog.logs
WHERE index_name = ${idx} AND timestamp >= ${start} AND timestamp <= ${now}
  AND JSONExtractString(structured_data, 'kind') = 'snapshot'
ORDER BY timestamp DESC
LIMIT 1`;
  }
  const ts = timeColumn(backend);
  return `SELECT
  ${ts} AS at,
  CAST(json_extract(structured_data, '$.out_24h') AS REAL) AS out_24h,
  CAST(json_extract(structured_data, '$.out_7d') AS REAL) AS out_7d,
  json_type(structured_data, '$.out_24h') IS NOT NULL AS has_24h,
  json_type(structured_data, '$.out_7d') IS NOT NULL AS has_7d
FROM logs
WHERE index_name = ${idx} AND ${ts} >= ${start} AND ${ts} <= ${now}
  AND json_valid(structured_data) AND json_extract(structured_data, '$.kind') = 'snapshot'
ORDER BY ${ts} DESC
LIMIT 1`;
}

/** How many money events arrived in the window and when the last one did. */
export function buildMoneyPresenceSql(backend: Backend, nowMs: number): string {
  const now = timeLiteral(backend, nowMs);
  const start = timeLiteral(backend, nowMs - ACTIVITY_WINDOW_MS);
  const idx = stringLiteral(MONEY_INDEX);
  if (backend === 'clickhouse') {
    return `SELECT count() AS events, toUnixTimestamp64Milli(max(timestamp)) AS last_at
FROM lognog.logs
WHERE index_name = ${idx} AND timestamp >= ${start} AND timestamp <= ${now}`;
  }
  const ts = timeColumn(backend);
  return `SELECT COUNT(*) AS events, MAX(${ts}) AS last_at
FROM logs
WHERE index_name = ${idx} AND ${ts} >= ${start} AND ${ts} <= ${now}`;
}

/**
 * Logged AI spend: the sum of cost_usd above zero per (app, index) between
 * `startMs` and `endMs`, with the part since `splitMs` broken out
 * (today vs this week on Home; this week only on the Weekly).
 * A cost sent as a number or as a numeric string counts, exactly like the DSL's
 * `cost_usd>0` (the drill-down), so the sum and the logs behind it agree.
 */
export function buildAiSpendSql(
  backend: Backend,
  startMs: number,
  endMs: number,
  splitMs: number,
  allowedIndexes?: string[] | null,
): string {
  const start = timeLiteral(backend, startMs);
  const end = timeLiteral(backend, endMs);
  const split = timeLiteral(backend, splitMs);
  const scope = scopeAnd(allowedIndexes);
  if (backend === 'clickhouse') {
    return `SELECT app_name, index_name,
  sum(cost) AS spend_total,
  sumIf(cost, timestamp >= ${split}) AS spend_recent,
  count() AS events
FROM (
  SELECT COALESCE(app_name, 'unknown') AS app_name, COALESCE(index_name, 'main') AS index_name, timestamp,
    toFloat64OrNull(if(JSONType(structured_data, '${AI_COST_FIELD}') = 'String', JSONExtractString(structured_data, '${AI_COST_FIELD}'), JSONExtractRaw(structured_data, '${AI_COST_FIELD}'))) AS cost
  FROM lognog.logs
  WHERE timestamp >= ${start} AND timestamp < ${end}${scope}
    AND position(structured_data, '"${AI_COST_FIELD}"') > 0
)
WHERE cost > 0
GROUP BY app_name, index_name
ORDER BY spend_total DESC
LIMIT 50`;
  }
  const ts = timeColumn(backend);
  return `SELECT app_name, index_name,
  SUM(cost) AS spend_total,
  SUM(CASE WHEN t >= ${split} THEN cost ELSE 0 END) AS spend_recent,
  COUNT(*) AS events
FROM (
  SELECT COALESCE(app_name, 'unknown') AS app_name, COALESCE(index_name, 'main') AS index_name, ${ts} AS t,
    CAST(json_extract(structured_data, '$.${AI_COST_FIELD}') AS REAL) AS cost
  FROM logs
  WHERE ${ts} >= ${start} AND ${ts} < ${end}${scope}
    AND structured_data LIKE '%"${AI_COST_FIELD}"%'
    AND json_valid(structured_data)
)
WHERE cost > 0
GROUP BY app_name, index_name
ORDER BY spend_total DESC
LIMIT 50`;
}

// ---------------------------------------------------------------------------
// Judging apps
// ---------------------------------------------------------------------------

export type AppState = 'errors' | 'quiet' | 'fine' | 'new';

export interface AppSummary {
  app_name: string;
  index_name: string;
  state: AppState;
  /** Two or three words for the pill: "Fine", "Errors 4× normal", "Quiet 3 h". */
  label: string;
  /** One plain sentence saying why. */
  detail: string;
  logs_today: number;
  errors_today: number;
  logs_window: number;
  /** Average errors per day over the baseline days, null when there is less than a day of history. */
  baseline_errors_per_day: number | null;
  baseline_days: number;
  error_ratio: number | null;
  last_seen: string | null;
  silent_ms: number | null;
  longest_gap_ms: number | null;
  quiet_after_ms: number | null;
}

export function formatDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / MINUTE));
  if (m < 60) return `${m} min`;
  const h = ms / HOUR;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(ms / DAY)} days`;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function assessApp(row: AppActivityRow, nowMs: number, t: HomeThresholds): AppSummary {
  const lastSeen = parseServerTime(row.last_seen);
  const firstSeen = parseServerTime(row.first_seen);
  const logsToday = n(row.logs_today);
  const errorsToday = n(row.errors_today);
  const activeMinutes = n(row.active_minutes);
  const dayStart = nowMs - DAY;
  const baseStart = dayStart - BASELINE_DAYS * DAY;

  // Days of history before today that the baseline actually covers.
  const coveredFrom = firstSeen === null ? dayStart : Math.max(firstSeen, baseStart);
  const baselineDays = Math.max(0, Math.min(BASELINE_DAYS, (dayStart - coveredFrom) / DAY));
  const baselinePerDay = baselineDays >= 1 ? n(row.errors_baseline) / baselineDays : null;

  let errorRatio: number | null = null;
  let spike = false;
  if (baselinePerDay !== null && errorsToday >= t.spikeMinErrors) {
    if (baselinePerDay === 0) {
      spike = true;
    } else {
      errorRatio = errorsToday / baselinePerDay;
      spike = errorRatio >= t.spikeMultiplier;
    }
  }

  const silentMs = lastSeen === null ? null : Math.max(0, nowMs - lastSeen);
  const longestGapMs = n(row.longest_gap_s) * 1000;
  const canJudgeQuiet = activeMinutes >= t.quietMinActiveMinutes;
  const quietAfterMs = canJudgeQuiet ? Math.max(t.quietMultiplier * longestGapMs, t.quietFloorMs) : null;
  const quiet = silentMs !== null && quietAfterMs !== null && silentMs > quietAfterMs;

  const base = {
    app_name: row.app_name,
    index_name: row.index_name,
    logs_today: logsToday,
    errors_today: errorsToday,
    logs_window: n(row.logs_window),
    baseline_errors_per_day: baselinePerDay === null ? null : Math.round(baselinePerDay * 10) / 10,
    baseline_days: Math.round(baselineDays * 10) / 10,
    error_ratio: errorRatio === null ? null : Math.round(errorRatio * 10) / 10,
    last_seen: lastSeen === null ? null : new Date(lastSeen).toISOString(),
    silent_ms: silentMs,
    longest_gap_ms: canJudgeQuiet ? longestGapMs : null,
    quiet_after_ms: quietAfterMs,
  };

  const errorsWord = (k: number) => `${k} error${k === 1 ? '' : 's'}`;

  if (quiet && silentMs !== null) {
    return {
      ...base,
      state: 'quiet',
      label: `Quiet ${formatDuration(silentMs)}`,
      detail:
        `No logs for ${formatDuration(silentMs)}. ` +
        (longestGapMs > 0
          ? `Its longest silence in the last 14 days was ${formatDuration(longestGapMs)}.`
          : `It usually logs every minute.`),
    };
  }
  if (spike) {
    const normal =
      baselinePerDay === 0
        ? 'a normal day has none'
        : `a normal day has about ${Math.max(1, Math.round(baselinePerDay ?? 0))}`;
    return {
      ...base,
      state: 'errors',
      label: errorRatio === null ? `Errors, ${errorsToday} today` : `Errors ${Math.round(errorRatio)}× normal`,
      detail: `${errorsWord(errorsToday)} in the last 24 h; ${normal}.`,
    };
  }
  if (baselinePerDay === null || !canJudgeQuiet) {
    return {
      ...base,
      state: 'new',
      label: 'New',
      detail: `${logsToday} logs in the last 24 h. Too new to compare: it needs a day of history.`,
    };
  }
  return {
    ...base,
    state: 'fine',
    label: 'Fine',
    detail:
      errorsToday === 0
        ? `${logsToday} logs in the last 24 h, no errors.`
        : `${logsToday} logs and ${errorsWord(errorsToday)} in the last 24 h, about a normal day.`,
  };
}

const STATE_ORDER: Record<AppState, number> = { errors: 0, quiet: 1, new: 2, fine: 3 };

/** Worst first: error spikes, then quiet apps, then the rest by how much they log. */
export function sortApps(apps: AppSummary[]): AppSummary[] {
  return [...apps].sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      (b.error_ratio ?? b.errors_today) - (a.error_ratio ?? a.errors_today) ||
      b.logs_today - a.logs_today ||
      a.app_name.localeCompare(b.app_name),
  );
}

// ---------------------------------------------------------------------------
// Alerts that can't reach Robert (T1's broken-channel check)
// ---------------------------------------------------------------------------

export interface UnreachableAlert {
  alert_id: string;
  alert_name: string;
  problems: string[];
}

export function findUnreachableAlerts(): UnreachableAlert[] {
  let channels: ReturnType<typeof getNotificationChannels> | null;
  try {
    channels = getNotificationChannels();
  } catch {
    channels = null; // can't judge apprise actions; findActionProblems then never false-alarms
  }
  const out: UnreachableAlert[] = [];
  for (const alert of getAlerts(true)) {
    let actions: AlertAction[] = [];
    try {
      actions = JSON.parse(alert.actions || '[]');
    } catch {
      actions = [];
    }
    const problems = findActionProblems(actions, channels);
    if (problems.length > 0) {
      out.push({ alert_id: alert.id, alert_name: alert.name, problems: problems.map(p => p.problem) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export interface BankSpend {
  index: string;
  /** 'ok' | no money events at all | events but no snapshot | the caller's key can't see the index */
  status: 'ok' | 'no_events' | 'no_snapshot' | 'not_visible';
  as_of: string | null;
  out_24h: number | null;
  out_7d: number | null;
  events: number;
  last_event_at: string | null;
}

export interface AiSpendApp {
  app_name: string;
  index_name: string;
  spend_recent: number;
  spend_total: number;
  events: number;
}

export interface AiSpend {
  field: string;
  status: 'ok' | 'none';
  today: number;
  week: number;
  events: number;
  by_app: AiSpendApp[];
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export async function loadBankSpend(nowMs: number, allowedIndexes?: string[] | null): Promise<BankSpend> {
  const empty: BankSpend = {
    index: MONEY_INDEX,
    status: 'no_events',
    as_of: null,
    out_24h: null,
    out_7d: null,
    events: 0,
    last_event_at: null,
  };
  if (!isIndexAllowed(allowedIndexes, MONEY_INDEX)) return { ...empty, status: 'not_visible' };
  const backend = getBackend();
  const [presence] = await executeRawQuery<{ events: number | string; last_at: string | number | null }>(
    buildMoneyPresenceSql(backend, nowMs),
  );
  const events = n(presence?.events);
  if (events === 0) return empty;
  const lastAt = parseServerTime(presence?.last_at);
  const [snap] = await executeRawQuery<{
    at: string | number;
    out_24h: number | null;
    out_7d: number | null;
    has_24h: number | boolean;
    has_7d: number | boolean;
  }>(buildMoneySnapshotSql(backend, nowMs));
  const common = { ...empty, events, last_event_at: lastAt === null ? null : new Date(lastAt).toISOString() };
  if (!snap) return { ...common, status: 'no_snapshot' };
  const at = parseServerTime(snap.at);
  return {
    ...common,
    status: 'ok',
    as_of: at === null ? null : new Date(at).toISOString(),
    out_24h: Number(snap.has_24h) ? round2(n(snap.out_24h)) : null,
    out_7d: Number(snap.has_7d) ? round2(n(snap.out_7d)) : null,
  };
}

export async function loadAiSpend(
  startMs: number,
  endMs: number,
  splitMs: number,
  allowedIndexes?: string[] | null,
): Promise<AiSpend> {
  const rows = await executeRawQuery<{
    app_name: string;
    index_name: string;
    spend_total: number | string;
    spend_recent: number | string;
    events: number | string;
  }>(buildAiSpendSql(getBackend(), startMs, endMs, splitMs, allowedIndexes));
  const byApp = rows
    .map(r => ({
      app_name: r.app_name,
      index_name: r.index_name,
      spend_recent: round2(n(r.spend_recent)),
      spend_total: round2(n(r.spend_total)),
      events: n(r.events),
    }))
    .filter(r => r.events > 0);
  const events = byApp.reduce((s, r) => s + r.events, 0);
  return {
    field: AI_COST_FIELD,
    status: events > 0 ? 'ok' : 'none',
    today: round2(byApp.reduce((s, r) => s + r.spend_recent, 0)),
    week: round2(byApp.reduce((s, r) => s + r.spend_total, 0)),
    events,
    by_app: byApp,
  };
}

// ---------------------------------------------------------------------------
// The whole Home summary
// ---------------------------------------------------------------------------

export type NeedsYouItem =
  | { kind: 'alert_unreachable'; alert_id: string; alert_name: string; problems: string[] }
  | { kind: 'error_spike'; app: AppSummary }
  | { kind: 'quiet'; app: AppSummary };

export interface HomeSummary {
  generated_at: string;
  backend: Backend;
  thresholds: HomeThresholds;
  money: { bank: BankSpend; ai: AiSpend };
  needs_you: NeedsYouItem[];
  apps: AppSummary[];
  /** True when the caller's key only sees some indexes (numbers cover those only). */
  scoped: boolean;
}

export async function loadApps(nowMs: number, allowedIndexes?: string[] | null): Promise<AppSummary[]> {
  const rows = await executeRawQuery<AppActivityRow>(buildAppActivitySql(getBackend(), nowMs, allowedIndexes));
  const t = homeThresholds();
  return sortApps(rows.map(r => assessApp(r, nowMs, t)));
}

export function needsYouFrom(apps: AppSummary[], unreachable: UnreachableAlert[]): NeedsYouItem[] {
  const items: NeedsYouItem[] = unreachable.map(a => ({ kind: 'alert_unreachable' as const, ...a }));
  for (const app of apps) {
    if (app.state === 'errors') items.push({ kind: 'error_spike', app });
    if (app.state === 'quiet') items.push({ kind: 'quiet', app });
  }
  return items;
}

export async function getHomeSummary(opts: {
  nowMs?: number;
  allowedIndexes?: string[] | null;
}): Promise<HomeSummary> {
  const nowMs = opts.nowMs ?? Date.now();
  const allowed = opts.allowedIndexes ?? null;
  const [apps, bank, ai] = await Promise.all([
    loadApps(nowMs, allowed),
    loadBankSpend(nowMs, allowed),
    loadAiSpend(nowMs - 7 * DAY, nowMs + 1, nowMs - DAY, allowed),
  ]);
  const unreachable = findUnreachableAlerts();
  return {
    generated_at: new Date(nowMs).toISOString(),
    backend: getBackend(),
    thresholds: homeThresholds(),
    money: { bank, ai },
    needs_you: needsYouFrom(apps, unreachable),
    apps,
    scoped: Array.isArray(allowed) && allowed.length > 0,
  };
}
