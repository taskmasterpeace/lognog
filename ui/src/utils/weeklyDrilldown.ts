/**
 * Drill-down links for The LogNog Weekly (Reports page).
 *
 * Every number in the paper is counted by api/src/services/weekly-report.ts
 * over one exact span (the report's `range`, latest = end - 1 ms because the
 * Search page's latest is inclusive). These builders give the Search query
 * that finds the same rows. Kept free of React/browser imports so the API
 * test suite runs these exact queries against the real DSL engine
 * (api/src/services/weekly-report.test.ts).
 */
import { searchUrlBetween, sourceErrorsQuery, sourceLogsQuery, aiSpendQuery, MONEY_INDEX } from './homeDrilldown';

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export interface Span {
  earliest: string;
  latest: string;
}

/** Every log the key can read (the "Logs this week" tile). */
export function allLogsQuery(): string {
  return 'search *';
}

/** Every error, severity 0-3 (the "Errors" tile; the same rule as Home and Data Sources). */
export function allErrorsQuery(): string {
  return 'search severity<=3';
}

/** One exact error message in one app (what broke / what got fixed). */
export function errorMessageQuery(indexName: string, appName: string, message: string): string {
  return `${sourceErrorsQuery(indexName, appName)} message=${quote(message)}`;
}

/** money-watch's per-day totals the bank story is added up from. */
export function moneyDaysQuery(): string {
  return `search index=${quote(MONEY_INDEX)} kind="day"`;
}

export function spanUrl(query: string, span: Span): string {
  return searchUrlBetween(query, span.earliest, span.latest);
}

/** The Alerts page with its history open (every firing and whether it was delivered). */
export const ALERT_HISTORY_URL = '/alerts?history=all';

export { sourceLogsQuery, sourceErrorsQuery, aiSpendQuery };
