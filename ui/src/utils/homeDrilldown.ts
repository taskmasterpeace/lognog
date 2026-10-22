/**
 * Drill-down links for the Home page ("Needs you") and the Weekly paper.
 *
 * Each number on Home is counted by api/src/services/home-summary.ts; these
 * builders give the Search query that finds the same rows, so the number you
 * click and the logs you land on agree. Kept free of React/browser imports so
 * the API test suite can run these exact queries against the real DSL engine
 * (api/src/services/home-summary.test.ts).
 */
import { searchUrl, sourceErrorsQuery, sourceLogsQuery, SOURCE_ERROR_CONDITION } from './sourceDrilldown';

/** Home counts "today" as the last 24 hours. */
export const TODAY_EARLIEST = '-24h';
/** "This week" on Home is the last 7 days. */
export const WEEK_EARLIEST = '-7d';
/** The window Home looks back over for apps and money events. */
export const WINDOW_EARLIEST = '-14d';

/** money-watch sends to this index (the API's MONEY_INDEX). */
export const MONEY_INDEX = 'money';
/** Logged AI spend is any event with a numeric cost_usd (the API's AI_COST_FIELD). */
export const AI_COST_FIELD = 'cost_usd';

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function appLogsUrl(indexName: string, appName: string, earliest: string = TODAY_EARLIEST): string {
  return searchUrl(sourceLogsQuery(indexName, appName), earliest);
}

export function appErrorsUrl(indexName: string, appName: string, earliest: string = TODAY_EARLIEST): string {
  return searchUrl(sourceErrorsQuery(indexName, appName), earliest);
}

/** The money-watch snapshots the bank numbers come from. */
export function moneySnapshotQuery(): string {
  return `search index=${quote(MONEY_INDEX)} kind="snapshot"`;
}

/** Every money event (for the "no snapshot yet" state). */
export function moneyEventsQuery(): string {
  return `search index=${quote(MONEY_INDEX)}`;
}

/** Events that carry AI spend, optionally for one app. */
export function aiSpendQuery(indexName?: string, appName?: string): string {
  const scope = indexName && appName ? ` index=${quote(indexName)} app_name=${quote(appName)}` : '';
  return `search${scope} ${AI_COST_FIELD}>0`;
}

/** Search URL for an absolute time span (the Weekly paper's week). */
export function searchUrlBetween(query: string, startIso: string, endIso: string): string {
  const params = new URLSearchParams({ q: query, earliest: startIso, latest: endIso });
  return `/search?${params.toString()}`;
}

/** Opens the alert's editor on the Alerts page so a broken delivery can be fixed. */
export function alertFixUrl(alertId: string): string {
  return `/alerts?${new URLSearchParams({ edit: alertId }).toString()}`;
}

export { searchUrl, sourceLogsQuery, sourceErrorsQuery, SOURCE_ERROR_CONDITION };
