/**
 * How fresh an app's logs are, in the words the Data Sources page shows.
 *
 * This is the ONE place the rule lives. The Data Sources table reads
 * `status` from GET /stats/sources (computed here), and the lab lights
 * (GET /status/lights, services/lab-lights.ts) turn the same status into
 * green / yellow / red. Before this module the thresholds sat inside
 * ui/src/pages/DataSourcesPage.tsx and the UI parsed `last_seen` itself,
 * which read ClickHouse's zone-less times as local time.
 *
 *   active    newest log under 15 min old
 *   recent    15 min to 1 hour
 *   inactive  1 hour to 1 day
 *   stale     over 1 day
 */
export type SourceStatus = 'active' | 'recent' | 'inactive' | 'stale';

/** Upper bound (exclusive) of each status, in minutes. Anything older is stale. */
export const SOURCE_STATUS_MINUTES = {
  active: 15,
  recent: 60,
  inactive: 60 * 24,
} as const;

/**
 * Status from the age of the newest log, in seconds. A negative age (a log
 * stamped slightly in the future, clock skew) counts as just now.
 */
export function sourceStatusFromAge(ageSeconds: number): SourceStatus {
  const minutes = Math.max(0, ageSeconds) / 60;
  if (minutes < SOURCE_STATUS_MINUTES.active) return 'active';
  if (minutes < SOURCE_STATUS_MINUTES.recent) return 'recent';
  if (minutes < SOURCE_STATUS_MINUTES.inactive) return 'inactive';
  return 'stale';
}

/**
 * Age in seconds of a stored timestamp. Lite stores ISO strings with a zone
 * ("...Z"); a zone-less string is read as UTC, the same way the UI reads
 * server times since the T7 fix. Unparseable input counts as very old.
 */
export function ageSecondsFrom(timestamp: string | null | undefined, nowMs: number = Date.now()): number {
  const ms = parseServerTime(timestamp);
  if (ms === null) return Number.POSITIVE_INFINITY;
  return Math.round((nowMs - ms) / 1000);
}

/** Epoch ms of a stored timestamp (zone-less = UTC), or null when unparseable. */
export function parseServerTime(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const s = String(timestamp).trim();
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  const ms = Date.parse(hasZone ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(ms) ? null : ms;
}
