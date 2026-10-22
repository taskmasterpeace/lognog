/**
 * How the Data Sources table and the Home page's app cards show a source's freshness.
 *
 * The rule itself (15 min / 1 hour / 1 day) lives in the API
 * (api/src/services/source-status.ts) and arrives as `status` on each row of
 * GET /stats/sources, the same rule the lab lights use. This file picks the
 * words and colours, so the page and the lights can never disagree.
 * getStatusInfo() is for screens that only have a `last_seen` time (Home's
 * app cards); it uses the same thresholds as the API (STATUS_MINUTES below).
 *
 * Kept free of React/browser imports so the API test suite can import it
 * (api/src/db/app-activity.test.ts, api/src/services/source-status-utc.test.ts).
 */
import { toDate } from './formatDate';

export type SourceStatus = 'active' | 'recent' | 'inactive' | 'stale';

export interface SourceStatusInfo {
  label: string;
  color: string;
  dotClass: string;
}

export const SOURCE_STATUS_INFO: Record<SourceStatus, SourceStatusInfo> = {
  active: { label: 'Active', color: 'text-green-500', dotClass: 'bg-green-500' },
  recent: { label: 'Recent', color: 'text-yellow-500', dotClass: 'bg-yellow-500' },
  inactive: { label: 'Inactive', color: 'text-honey-500', dotClass: 'bg-honey-500' },
  stale: { label: 'Stale', color: 'text-nog-400', dotClass: 'bg-nog-400' },
};

/** Same bounds as SOURCE_STATUS_MINUTES in api/src/services/source-status.ts. */
const STATUS_MINUTES = { active: 15, recent: 60, inactive: 60 * 24 } as const;

/** Words and colours for a status from the API; anything unknown reads as Stale. */
export function sourceStatusInfo(status: string | null | undefined): SourceStatusInfo {
  return SOURCE_STATUS_INFO[(status ?? '') as SourceStatus] ?? SOURCE_STATUS_INFO.stale;
}

/**
 * Status from a `last_seen` time when the API didn't send one.
 * Under 15 min since the last log: Active. Under an hour: Recent.
 * Under a day: Inactive. Older: Stale. Server times without a zone are UTC.
 */
export function getStatusInfo(lastSeen: string, now: Date = new Date()): SourceStatusInfo {
  const minutes = (now.getTime() - toDate(lastSeen).getTime()) / (1000 * 60);
  if (minutes < STATUS_MINUTES.active) return SOURCE_STATUS_INFO.active;
  if (minutes < STATUS_MINUTES.recent) return SOURCE_STATUS_INFO.recent;
  if (minutes < STATUS_MINUTES.inactive) return SOURCE_STATUS_INFO.inactive;
  return SOURCE_STATUS_INFO.stale;
}

/** "just now", "12m ago", "3h ago", "2d ago" from an age in seconds. */
export function ageAgo(ageSeconds: number | null | undefined): string {
  if (ageSeconds == null || !Number.isFinite(ageSeconds)) return '-';
  const minutes = Math.floor(Math.max(0, ageSeconds) / 60);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** "just now", "12m ago", "3h ago", "2d ago" from a server time. */
export function formatRelativeTime(dateStr: string, now: Date = new Date()): string {
  return ageAgo((now.getTime() - toDate(dateStr).getTime()) / 1000);
}
