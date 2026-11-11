/**
 * Daily alert digest.
 *
 * Once a day LogNog sends ONE message through the studio relay that sums up
 * the alerts that fired in the last 24 hours. Rules that only record history
 * (no text when they fire) are seen here, once, in the morning.
 *
 * Settings are system settings (key/value, no migration):
 *   alert_digest_enabled          'true' | 'false'   default false
 *   alert_digest_time             'HH:MM'            default 08:30
 *   alert_digest_tz               IANA zone          default America/New_York
 *   alert_digest_send_when_quiet  'true' | 'false'   default false
 *   alert_digest_last_sent        'YYYY-MM-DD'       local date of the last digest
 *
 * The day is marked done only after the relay says ok (or on a quiet day with
 * nothing to send). A refused or failed send is tried again on later ticks,
 * no more often than every RETRY_GAP_MS, and not at all after the give-up
 * time (local noon), so a broken relay is not retried all day.
 */

import { getSQLiteDB, getAlerts, getSystemSetting, setSystemSetting } from '../db/sqlite.js';
import { buildRelayPayload, postToRelay, getRelayConfig, describeRelayFailure } from './relay.js';

export const DIGEST_KEYS = {
  enabled: 'alert_digest_enabled',
  time: 'alert_digest_time',
  tz: 'alert_digest_tz',
  sendWhenQuiet: 'alert_digest_send_when_quiet',
  lastSent: 'alert_digest_last_sent',
} as const;

export const DIGEST_DEFAULT_TIME = '08:30';
export const DIGEST_DEFAULT_TZ = 'America/New_York';
/** The message itself stays at or under this, leaving room for the relay's prefix (limit 1000). */
export const DIGEST_TEXT_MAX = 900;
export const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;
/** After a failed send, wait this long before the next try. */
export const DIGEST_RETRY_GAP_MS = 10 * 60 * 1000;
/** No tries at or after this local time (minutes after midnight): 12:00. */
export const DIGEST_GIVE_UP_MINUTES = 12 * 60;
/** How long a digest time later than 11:00 keeps trying. */
const LATE_RETRY_MINUTES = 60;
const RULE_NAME_MAX = 60;
const DELETED_RULE = 'a deleted rule';
/** Actions that reach a person when the alert fires. */
const TEXTING_ACTIONS: ReadonlySet<string> = new Set(['relay', 'email', 'webhook', 'apprise']);

export interface DigestHistoryRow {
  alert_id: string;
  triggered_at: string;
  severity: string;
  result_count?: number;
  /** JSON array of {type, success, message}, as stored. */
  actions_executed?: string | null;
}

export interface DigestRule {
  name: string;
  severity: string;
  count: number;
  texted: number;
}

export interface AlertDigest {
  total: number;
  texted: number;
  recordedOnly: number;
  critical: number;
  byRule: DigestRule[];
  text: string;
}

export type DigestAlertLookup =
  | ReadonlyMap<string, { name: string; severity?: string }>
  | Record<string, { name: string; severity?: string }>;

/** Raw setting values, keyed by setting name. Missing or null means "use the default". */
export type DigestSettings = Partial<Record<(typeof DIGEST_KEYS)[keyof typeof DIGEST_KEYS], string | null>>;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDigestTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

export function isValidDigestTz(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The settings as they will be used: bad or missing values replaced by the defaults. */
export function effectiveDigestSettings(settings: DigestSettings): {
  enabled: boolean;
  time: string;
  tz: string;
  sendWhenQuiet: boolean;
  lastSent: string | null;
} {
  const time = settings[DIGEST_KEYS.time];
  const tz = settings[DIGEST_KEYS.tz];
  return {
    enabled: settings[DIGEST_KEYS.enabled] === 'true',
    time: isValidDigestTime(time) ? time : DIGEST_DEFAULT_TIME,
    tz: isValidDigestTz(tz) ? tz : DIGEST_DEFAULT_TZ,
    sendWhenQuiet: settings[DIGEST_KEYS.sendWhenQuiet] === 'true',
    lastSent: settings[DIGEST_KEYS.lastSent] || null,
  };
}

/** Local date ('YYYY-MM-DD') and minutes after midnight in a zone. The zone must be valid. */
export function localDateAndMinutes(now: Date, tz: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(get('hour')) % 24;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: hour * 60 + Number(get('minute')) };
}

function timeToMinutes(time: string): number {
  const m = TIME_RE.exec(time)!;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Due when the digest is on, the local time in its zone is at or after HH:MM,
 * and no digest has been marked for today's local date. Never throws.
 */
export function isDigestDue(settings: DigestSettings, now: Date = new Date()): boolean {
  try {
    const s = effectiveDigestSettings(settings);
    if (!s.enabled) return false;
    if (Number.isNaN(now.getTime())) return false;
    const local = localDateAndMinutes(now, s.tz);
    if (local.minutes < timeToMinutes(s.time)) return false;
    return s.lastSent !== local.date;
  } catch {
    return false;
  }
}

/** One line, no line breaks, at most RULE_NAME_MAX characters, never cut inside a word or an emoji. */
function tidyRuleName(name: string): string {
  const clean = (name || '').replace(/\s+/g, ' ').trim() || 'an unnamed rule';
  const graphemes = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clean), (s) => s.segment);
  if (graphemes.length <= RULE_NAME_MAX) return clean;
  const kept = graphemes.slice(0, RULE_NAME_MAX - 1);
  const lastSpace = kept.lastIndexOf(' ');
  // Cut at the last word break when there is one reasonably far in.
  const cut = lastSpace >= RULE_NAME_MAX / 2 ? kept.slice(0, lastSpace) : kept;
  return `${cut.join('').trimEnd()}…`;
}

function wasTexted(actionsExecuted: string | null | undefined): boolean {
  if (!actionsExecuted) return false;
  try {
    const actions: unknown = JSON.parse(actionsExecuted);
    if (!Array.isArray(actions)) return false;
    return actions.some((a) => {
      if (!a || typeof a !== 'object') return false;
      const { type, success } = a as { type?: unknown; success?: unknown };
      return success === true && typeof type === 'string' && TEXTING_ACTIONS.has(type);
    });
  } catch {
    return false;
  }
}

/** SQLite 'YYYY-MM-DD HH:MM:SS' (UTC) or an ISO string, as milliseconds. NaN when unreadable. */
function triggeredAtMs(value: string): number {
  if (typeof value !== 'string') return NaN;
  const v = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(v) ? `${v.replace(' ', 'T')}Z` : v;
  return Date.parse(iso);
}

function len(text: string): number {
  return Array.from(text).length; // the relay counts an emoji as one character
}

function digestText(d: Omit<AlertDigest, 'text'>): string {
  if (d.total === 0) {
    return 'LogNog daily digest: no alerts in the last 24 hours. All quiet.';
  }
  const head = `LogNog daily digest: ${d.total} ${d.total === 1 ? 'alert' : 'alerts'} in the last 24 hours.`;
  const said = (n: number, one: string, many: string): string => (n === 1 ? `1 ${one}` : `${n} ${many}`);
  let split: string;
  if (d.total === 1) {
    split = d.texted === 1 ? 'It was texted to you when it happened.' : 'It was only recorded, not texted.';
  } else if (d.recordedOnly === 0) {
    split = `All ${d.total} were texted to you when they happened.`;
  } else if (d.texted === 0) {
    split = `None were texted to you, all ${d.total} were only recorded.`;
  } else {
    split = `${said(d.texted, 'was texted to you when it happened', 'were texted to you when they happened')}, ${said(d.recordedOnly, 'was only recorded', 'were only recorded')}.`;
  }
  const critical = d.critical > 0 ? ` ${said(d.critical, 'was critical', 'were critical')}.` : '';
  const tail = ' Open LogNog → Alerts → History for details.';

  const compose = (shown: number): string => {
    const names = d.byRule.slice(0, shown).map((r) => `${r.name} ×${r.count}`);
    const rest = d.byRule.length - shown;
    if (rest > 0) names.push(`and ${rest} more`);
    const list = names.length > 0 ? ` Most often: ${names.join(', ')}.` : '';
    return `${head} ${split}${critical}${list}${tail}`;
  };

  // Show as many rules as fit (at most 8); drop whole rules, never part of one.
  for (let shown = Math.min(d.byRule.length, 8); shown > 0; shown--) {
    const text = compose(shown);
    if (len(text) <= DIGEST_TEXT_MAX) return text;
  }
  return `${head} ${split}${critical}${tail}`;
}

/**
 * Sum up history rows. Only rows inside the 24 hours before `now` are counted
 * (rows with an unreadable time are kept: the caller already picked them).
 */
export function buildAlertDigest(rows: readonly DigestHistoryRow[], alertsById: DigestAlertLookup, now: Date = new Date()): AlertDigest {
  const lookup = (id: string): { name: string; severity?: string } | undefined =>
    alertsById instanceof Map
      ? alertsById.get(id)
      : Object.prototype.hasOwnProperty.call(alertsById, id)
        ? (alertsById as Record<string, { name: string; severity?: string }>)[id]
        : undefined;

  const end = now.getTime();
  const start = end - DIGEST_WINDOW_MS;
  const rules = new Map<string, DigestRule>();
  let total = 0;
  let texted = 0;
  let critical = 0;

  for (const row of rows) {
    if (!row) continue;
    const at = triggeredAtMs(row.triggered_at);
    if (!Number.isNaN(at) && (at < start || at > end)) continue;

    const alert = lookup(row.alert_id);
    // Every deleted rule lands in one line: their names are gone.
    const key = alert ? `id:${row.alert_id}` : 'deleted';
    let rule = rules.get(key);
    if (!rule) {
      rule = {
        name: alert ? tidyRuleName(alert.name) : DELETED_RULE,
        severity: alert?.severity || row.severity || 'medium',
        count: 0,
        texted: 0,
      };
      rules.set(key, rule);
    }
    const didText = wasTexted(row.actions_executed);
    rule.count += 1;
    total += 1;
    if (didText) {
      rule.texted += 1;
      texted += 1;
    }
    if (row.severity === 'critical') critical += 1;
  }

  const byRule = [...rules.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const summary = { total, texted, recordedOnly: total - texted, critical, byRule };
  return { ...summary, text: digestText(summary) };
}

function sqliteTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/** History rows from the 24 hours before `now`, newest first. */
export function getDigestHistoryRows(now: Date = new Date()): DigestHistoryRow[] {
  const end = now.getTime();
  return getSQLiteDB()
    .prepare(
      `SELECT alert_id, triggered_at, severity, result_count, actions_executed
       FROM alert_history
       WHERE triggered_at >= ? AND triggered_at <= ?
       ORDER BY triggered_at DESC, rowid DESC`
    )
    .all(sqliteTime(end - DIGEST_WINDOW_MS), sqliteTime(end)) as DigestHistoryRow[];
}

/** The digest for the 24 hours before `now`, from the real history. Sends nothing. */
export function buildDigestFromHistory(now: Date = new Date()): AlertDigest {
  const alertsById = new Map<string, { name: string; severity?: string }>();
  for (const alert of getAlerts()) alertsById.set(alert.id, { name: alert.name, severity: alert.severity });
  return buildAlertDigest(getDigestHistoryRows(now), alertsById, now);
}

export function readDigestSettings(): DigestSettings {
  const settings: DigestSettings = {};
  for (const key of Object.values(DIGEST_KEYS)) settings[key] = getSystemSetting(key);
  return settings;
}

export type DigestRunStatus =
  | 'not_due'
  | 'not_configured'
  | 'gave_up'
  | 'waiting'
  | 'quiet'
  | 'sent'
  | 'failed'
  | 'error';

export interface DigestRunResult {
  status: DigestRunStatus;
  /** Plain reason, for 'failed' and 'error'. */
  detail?: string;
}

// In-memory guards. `sentDate` stops a second send on the same local day even
// if writing alert_digest_last_sent failed; `lastFailureMs` spaces out retries.
let sentDate: string | null = null;
let lastFailureMs: number | null = null;

/** Test hook: forget the in-memory guards. */
export function resetAlertDigestStateForTest(): void {
  sentDate = null;
  lastFailureMs = null;
}

/** The scheduler's once-a-tick check. Sends at most one digest a day. Never throws. */
export async function runAlertDigestIfDue(now: Date = new Date()): Promise<DigestRunResult> {
  try {
    const raw = readDigestSettings();
    if (!isDigestDue(raw, now)) return { status: 'not_due' };

    const s = effectiveDigestSettings(raw);
    const local = localDateAndMinutes(now, s.tz);
    if (sentDate === local.date) return { status: 'not_due' };

    // Stop trying at local noon (or an hour after a digest time later than 11:00).
    const giveUpAt = Math.max(DIGEST_GIVE_UP_MINUTES, timeToMinutes(s.time) + LATE_RETRY_MINUTES);
    if (local.minutes >= giveUpAt) return { status: 'gave_up' };

    const relay = getRelayConfig();
    if (!relay) return { status: 'not_configured' };

    const sinceFailure = lastFailureMs === null ? null : now.getTime() - lastFailureMs;
    if (sinceFailure !== null && sinceFailure >= 0 && sinceFailure < DIGEST_RETRY_GAP_MS) {
      return { status: 'waiting' };
    }

    const digest = buildDigestFromHistory(now);
    if (digest.total === 0 && !s.sendWhenQuiet) {
      sentDate = local.date;
      setSystemSetting(DIGEST_KEYS.lastSent, local.date);
      return { status: 'quiet' };
    }

    const reply = await postToRelay('send', buildRelayPayload('STUDIO', digest.text, {}), relay);
    if (!reply.ok) {
      lastFailureMs = now.getTime();
      const detail = describeRelayFailure(reply);
      console.error(`[Alert digest] not sent, will try again in a few minutes: ${detail}`);
      return { status: 'failed', detail };
    }

    sentDate = local.date;
    lastFailureMs = null;
    setSystemSetting(DIGEST_KEYS.lastSent, local.date);
    return { status: 'sent' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    console.error(`[Alert digest] check failed: ${detail}`);
    return { status: 'error', detail };
  }
}
