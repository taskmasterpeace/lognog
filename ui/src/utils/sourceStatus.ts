/**
 * How fresh a source is, in words and colour: one rule shared by the Data
 * Sources table and the Home page's app cards.
 *
 * Kept free of React so the API test suite can import it (api/src/services/source-status-utc.test.ts).
 */
import { toDate } from './formatDate';

export interface SourceStatus {
  /** Text colour class for the label. */
  color: string;
  /** Active / Recent / Inactive / Stale */
  label: string;
  /** Background class for the status dot. */
  dotClass: string;
}

/**
 * Under 15 min since the last log: Active. Under an hour: Recent.
 * Under a day: Inactive. Older: Stale. Server times without a zone are UTC.
 */
export function getStatusInfo(lastSeen: string, now: Date = new Date()): SourceStatus {
  const last = toDate(lastSeen);
  const diffMinutes = (now.getTime() - last.getTime()) / (1000 * 60);

  if (diffMinutes < 15) {
    return { color: 'text-green-500', label: 'Active', dotClass: 'bg-green-500' };
  } else if (diffMinutes < 60) {
    return { color: 'text-yellow-500', label: 'Recent', dotClass: 'bg-yellow-500' };
  } else if (diffMinutes < 60 * 24) {
    return { color: 'text-honey-500', label: 'Inactive', dotClass: 'bg-honey-500' };
  } else {
    return { color: 'text-nog-400', label: 'Stale', dotClass: 'bg-nog-400' };
  }
}

/** "just now", "12m ago", "3h ago", "2d ago". */
export function formatRelativeTime(dateStr: string, now: Date = new Date()): string {
  const date = toDate(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
