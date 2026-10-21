/**
 * Lab alert lights: one green / yellow / red light per app.
 *
 * Read by GET /status/lights (routes/status.ts): the round ESP32 screens on
 * the lab shelf (hardware/lab-lights/), the /lights page in the UI and the
 * Mac's spoken-red watcher all poll it, so it is built to be cheap: one log
 * query per key scope at most every 15 s, shared by every caller.
 *
 * The rule, in plain words:
 *   red     a high or critical alert about the app is firing,
 *           or the app has gone quiet (no logs for an hour: Data Sources says
 *           "Inactive" or "Stale"),
 *           or its errors spiked (10+ in 15 min and 3x its normal rate)
 *   yellow  a medium / warning / low alert about the app is firing,
 *           or the app is quiet 15-60 min (Data Sources says "Recent"),
 *           or errors are up (3+ in 15 min and 2x normal)
 *   green   everything else (Data Sources "Active", errors at their usual rate)
 * Freshness comes from services/source-status.ts, the same rule the Data
 * Sources page shows, so the two can never disagree.
 */
import { getAppActivity, type AppActivity } from '../db/backend.js';
import { getSQLiteDB } from '../db/sqlite.js';
import { isIndexAllowed } from '../auth/index-scope.js';
import { SOURCE_STATUS_MINUTES, sourceStatusFromAge, parseServerTime } from './source-status.js';

export type LightState = 'green' | 'yellow' | 'red';

export interface AppLight {
  app: string;
  /** Display name for a screen: "directors-palette" -> "Directors Palette", "hyh" -> "HYH". */
  label: string;
  state: LightState;
  /** One short line in plain words. */
  why: string;
  /** ISO time this state began, as far as this server has seen (resets when the API restarts). */
  since: string | null;
  logs_last_15m: number;
  errors_last_15m: number;
  /** ISO time of the newest log (null = none in 7 days). */
  last_seen: string | null;
  /** Indexes the app logs to, so a caller can open the logs behind a number. */
  indexes: string[];
}

export interface LightsResult {
  generated_at: string;
  refresh_seconds: number;
  apps: AppLight[];
}

export const LIGHTS_RULES = {
  /** Error spike: at least this many errors in 15 min... */
  spikeMinErrors: 10,
  /** ...and at least this many times the app's normal 15-minute error count. */
  spikeRatio: 3,
  /** Errors up (yellow): at least this many in 15 min... */
  warnMinErrors: 3,
  /** ...and at least this many times normal. */
  warnRatio: 2,
  /** An alert's "firing" state is ignored when its last evaluation is older than this. */
  alertFreshHours: 25,
  /** Server-side cache: one log query per key scope at most this often. */
  cacheMs: 15_000,
  /** What the ESP32s and the page poll at. */
  refreshSeconds: 30,
  /** Longest `why` sent to a screen. */
  maxWhyChars: 80,
} as const;

const RED_ALERT = new Set(['critical', 'high']);
const YELLOW_ALERT = new Set(['medium', 'warning', 'low']);

// ---------------------------------------------------------------------------
// Alerts: which rules are firing, and which apps they are about
// ---------------------------------------------------------------------------

export interface FiringAlert {
  id: string;
  name: string;
  severity: string;
  /** ISO time it last fired. */
  fired_at: string;
  indexes: string[];
  apps: string[];
}

/**
 * Which indexes / app names a rule's search is about, read from its query
 * (`index=hyh`, `index="money"`, `app_name=dp-web`). Wildcards and negations
 * (`index!=x`) are ignored: a rule over every index is not about one app.
 */
export function alertTargets(searchQuery: string): { indexes: string[]; apps: string[] } {
  const pick = (field: string): string[] => {
    const re = new RegExp(`(?:^|[\\s(])${field}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s|()"']+))`, 'gi');
    const out = new Set<string>();
    for (const m of searchQuery.matchAll(re)) {
      const v = (m[1] ?? m[2] ?? m[3] ?? '').trim();
      if (v && !v.includes('*')) out.add(v.toLowerCase());
    }
    return [...out];
  };
  return { indexes: pick('index'), apps: pick('app_name') };
}

interface AlertRow {
  id: string;
  name: string;
  severity: string;
  search_query: string;
  last_run: string | null;
  last_triggered: string | null;
  last_status: string | null;
  throttle_enabled: number | null;
  throttle_window_seconds: number | null;
  last_ack: number | null;
}

/**
 * An enabled rule is firing when its latest evaluation fired, or it fired
 * inside its throttle window (a throttled re-check records "ok" even while
 * the condition still holds), and nobody has acknowledged that firing.
 */
export function isFiring(row: AlertRow, nowMs: number): boolean {
  if (row.last_ack) return false;
  const triggered = parseServerTime(row.last_triggered);
  const ran = parseServerTime(row.last_run);
  if (triggered === null || ran === null) return false;
  if (nowMs - ran > LIGHTS_RULES.alertFreshHours * 3_600_000) return false;
  if (row.last_status === 'triggered') return true;
  const windowMs = (row.throttle_enabled ? Number(row.throttle_window_seconds) || 0 : 0) * 1000;
  return windowMs > 0 && nowMs - triggered <= windowMs;
}

export function loadFiringAlerts(nowMs: number = Date.now()): FiringAlert[] {
  const rows = getSQLiteDB()
    .prepare(
      `SELECT a.id, a.name, a.severity, a.search_query, a.last_run, a.last_triggered, a.last_status,
              a.throttle_enabled, a.throttle_window_seconds,
              (SELECT h.acknowledged FROM alert_history h
                 WHERE h.alert_id = a.id ORDER BY h.triggered_at DESC LIMIT 1) AS last_ack
         FROM alerts a
        WHERE a.enabled = 1 AND a.last_triggered IS NOT NULL`,
    )
    .all() as AlertRow[];
  return rows
    .filter((r) => isFiring(r, nowMs))
    .map((r) => ({
      id: r.id,
      name: r.name,
      severity: String(r.severity || '').toLowerCase(),
      fired_at: new Date(parseServerTime(r.last_triggered)!).toISOString(),
      ...alertTargets(r.search_query || ''),
    }));
}

/**
 * Alerts about this app. A rule counts when it searches one of the app's
 * indexes, or names the app (app_name=...) without naming an index the
 * caller's key may not read.
 */
export function alertsForApp(
  activity: Pick<AppActivity, 'app' | 'indexes'>,
  alerts: FiringAlert[],
  allowedIndexes?: string[] | null,
): FiringAlert[] {
  const app = activity.app.toLowerCase();
  const idx = new Set(activity.indexes.map((i) => i.toLowerCase()));
  return alerts.filter((a) => {
    if (a.indexes.some((i) => idx.has(i))) return true;
    if (!a.apps.includes(app)) return false;
    return a.indexes.every((i) => isIndexAllowed(allowedIndexes, i));
  });
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

/** "40 min", "3 h", "2 days". */
export function plainAge(seconds: number): string {
  const min = Math.floor(Math.max(0, seconds) / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} days`;
}

/** The app's normal error count for a 15-minute slice, from the 24 h before it. */
export function normalErrorsPer15m(errorsPrev24h: number): number {
  return (errorsPrev24h * 15) / (24 * 60 - 15);
}

function errorsVsNormal(errors: number, normal: number): string {
  if (normal < 0.5) return 'usually none';
  return `${Math.round(errors / normal)}x normal`;
}

export function displayLabel(app: string): string {
  const words = app.split(/[-_\s.]+/).filter(Boolean);
  if (words.length === 1 && words[0].length <= 3) return words[0].toUpperCase();
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function clip(s: string): string {
  return s.length > LIGHTS_RULES.maxWhyChars ? `${s.slice(0, LIGHTS_RULES.maxWhyChars - 1)}…` : s;
}

export interface Decision {
  state: LightState;
  why: string;
  /** Exact start of this state when the data says it (quiet, alert); otherwise null. */
  since_hint: string | null;
  /** Which rule decided it (stable key, used to restart `since` when the reason changes). */
  reason: string;
}

export function decideLight(activity: AppActivity, alerts: FiringAlert[]): Decision {
  const lastSeenMs = parseServerTime(activity.last_seen);
  const quietSince = (minutes: number) =>
    lastSeenMs === null ? null : new Date(lastSeenMs + minutes * 60_000).toISOString();
  const freshness = sourceStatusFromAge(activity.age_seconds);
  const normal = normalErrorsPer15m(activity.errors_prev_24h);
  const errors = activity.errors_15m;

  const byTime = (a: FiringAlert, b: FiringAlert) => a.fired_at.localeCompare(b.fired_at);
  const red = alerts.filter((a) => RED_ALERT.has(a.severity)).sort(byTime);
  const yellow = alerts.filter((a) => YELLOW_ALERT.has(a.severity)).sort(byTime);
  const alertWhy = (list: FiringAlert[]) =>
    `Alert: ${list[0].name}${list.length > 1 ? ` (+${list.length - 1} more)` : ''}`;

  // RED
  if (red.length) return { state: 'red', why: clip(alertWhy(red)), since_hint: red[0].fired_at, reason: `alert:${red[0].id}` };
  if (lastSeenMs === null || !Number.isFinite(activity.age_seconds)) {
    return { state: 'red', why: 'No logs in the last 7 days', since_hint: null, reason: 'quiet' };
  }
  if (freshness === 'inactive' || freshness === 'stale') {
    return {
      state: 'red',
      why: `Gone quiet: no logs for ${plainAge(activity.age_seconds)}`,
      since_hint: quietSince(SOURCE_STATUS_MINUTES.recent),
      reason: 'quiet',
    };
  }
  if (errors >= LIGHTS_RULES.spikeMinErrors && errors >= LIGHTS_RULES.spikeRatio * normal) {
    return {
      state: 'red',
      why: `Error spike: ${errors} in 15 min, ${errorsVsNormal(errors, normal)}`,
      since_hint: null,
      reason: 'spike',
    };
  }

  // YELLOW
  if (yellow.length) return { state: 'yellow', why: clip(alertWhy(yellow)), since_hint: yellow[0].fired_at, reason: `alert:${yellow[0].id}` };
  if (freshness === 'recent') {
    return {
      state: 'yellow',
      why: `Quiet: no logs for ${plainAge(activity.age_seconds)}`,
      since_hint: quietSince(SOURCE_STATUS_MINUTES.active),
      reason: 'quiet-short',
    };
  }
  if (errors >= LIGHTS_RULES.warnMinErrors && errors >= LIGHTS_RULES.warnRatio * normal) {
    return {
      state: 'yellow',
      why: `Errors up: ${errors} in 15 min, ${errorsVsNormal(errors, normal)}`,
      since_hint: null,
      reason: 'errors-up',
    };
  }

  // GREEN
  const logs = activity.logs_15m;
  const why =
    errors > 0
      ? `Fine: ${logs} logs, ${errors} error${errors === 1 ? '' : 's'} in 15 min`
      : `Fine: ${logs} log${logs === 1 ? '' : 's'} in 15 min, no errors`;
  return { state: 'green', why, since_hint: null, reason: 'fine' };
}

// ---------------------------------------------------------------------------
// Cached read, shared by every caller
// ---------------------------------------------------------------------------

interface CacheEntry {
  at: number;
  value?: { apps: AppLight[]; generated_at: string };
  pending?: Promise<{ apps: AppLight[]; generated_at: string }>;
}

const cache = new Map<string, CacheEntry>();
/** When each app entered its current state: `${scope}|${app}` -> state + reason + since. */
const transitions = new Map<string, { state: LightState; reason: string; since: string }>();
let logQueries = 0;
let clock: () => number = () => Date.now();

function scopeKey(allowedIndexes?: string[] | null): string {
  if (!allowedIndexes || allowedIndexes.length === 0) return '*';
  return [...new Set(allowedIndexes.map((i) => i.toLowerCase()))].sort().join(',');
}

function sinceFor(key: string, d: Decision, nowIso: string): string | null {
  const prev = transitions.get(key);
  let since: string;
  if (d.since_hint) since = d.since_hint;
  else if (prev && prev.state === d.state && prev.reason === d.reason) since = prev.since;
  else if (prev && prev.state === d.state) since = prev.since; // same colour, new wording: keep the start
  else since = nowIso;
  transitions.set(key, { state: d.state, reason: d.reason, since });
  return since;
}

async function compute(allowedIndexes: string[] | null | undefined): Promise<{ apps: AppLight[]; generated_at: string }> {
  const nowMs = clock();
  const nowIso = new Date(nowMs).toISOString();
  logQueries += 1;
  const activity = await getAppActivity(allowedIndexes ?? undefined, nowMs);
  const firing = loadFiringAlerts(nowMs);
  const sk = scopeKey(allowedIndexes);
  const apps = activity.map((a) => lightFor(a, firing, allowedIndexes, sk, nowIso));
  return { apps, generated_at: nowIso };
}

function lightFor(
  a: AppActivity,
  firing: FiringAlert[],
  allowedIndexes: string[] | null | undefined,
  sk: string,
  nowIso: string,
): AppLight {
  const d = decideLight(a, alertsForApp(a, firing, allowedIndexes));
  return {
    app: a.app,
    label: displayLabel(a.app),
    state: d.state,
    why: d.why,
    since: sinceFor(`${sk}|${a.app.toLowerCase()}`, d, nowIso),
    logs_last_15m: a.logs_15m,
    errors_last_15m: a.errors_15m,
    last_seen: a.last_seen,
    indexes: a.indexes,
  };
}

async function cachedLights(allowedIndexes?: string[] | null) {
  const key = scopeKey(allowedIndexes);
  const now = clock();
  const hit = cache.get(key);
  if (hit?.value && now - hit.at < LIGHTS_RULES.cacheMs) return hit.value;
  if (hit?.pending) return hit.pending;
  const pending = compute(allowedIndexes);
  cache.set(key, { at: hit?.at ?? 0, value: hit?.value, pending });
  try {
    const value = await pending;
    cache.set(key, { at: clock(), value });
    return value;
  } catch (err) {
    // Keep serving nothing stale on failure: drop the entry so the next call retries.
    cache.delete(key);
    throw err;
  }
}

/**
 * Lights for every app the key can see (7-day list, minus rows with no app
 * name), or for the asked-for apps in the order asked. An asked-for app with
 * no logs the key can read is red "No logs in the last 7 days" (the same
 * answer whether it doesn't exist or the key can't see it).
 */
export async function getLabLights(
  allowedIndexes?: string[] | null,
  apps?: string[],
): Promise<LightsResult> {
  const { apps: all, generated_at } = await cachedLights(allowedIndexes);
  let out: AppLight[];
  if (apps && apps.length) {
    out = apps.map((wanted) => {
      const w = wanted.toLowerCase();
      const found =
        all.find((l) => l.app.toLowerCase() === w) ??
        all.find((l) => l.app !== 'unknown' && l.indexes.some((i) => i.toLowerCase() === w));
      if (found) return found;
      return {
        app: wanted,
        label: displayLabel(wanted),
        state: 'red' as const,
        why: 'No logs in the last 7 days',
        since: null,
        logs_last_15m: 0,
        errors_last_15m: 0,
        last_seen: null,
        indexes: [],
      };
    });
  } else {
    out = all.filter((l) => l.app !== 'unknown');
  }
  return { generated_at, refresh_seconds: LIGHTS_RULES.refreshSeconds, apps: out };
}

/** Test hooks: reset the cache and state memory, read the query count, pin the clock. */
export const _labLightsTesting = {
  reset(): void {
    cache.clear();
    transitions.clear();
    logQueries = 0;
    clock = () => Date.now();
  },
  queries(): number {
    return logQueries;
  },
  setClock(fn: () => number): void {
    clock = fn;
  },
};
