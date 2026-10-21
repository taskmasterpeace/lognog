/**
 * How the Data Sources table shows a source's freshness.
 *
 * The rule itself (15 min / 1 hour / 1 day) lives in the API
 * (api/src/services/source-status.ts) and arrives as `status` on each row of
 * GET /stats/sources, the same rule the lab lights use. This file only picks
 * the words and colours, so the page and the lights can never disagree.
 *
 * Kept free of React/browser imports so the API test suite can import it.
 */
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

/** Words and colours for a status from the API; anything unknown reads as Stale. */
export function sourceStatusInfo(status: string | null | undefined): SourceStatusInfo {
  return SOURCE_STATUS_INFO[(status ?? '') as SourceStatus] ?? SOURCE_STATUS_INFO.stale;
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
