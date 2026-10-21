/**
 * Drill-down links for the Data Sources "Active Sources" table.
 *
 * Each row is one (index_name, app_name) pair counted over the last 7 days
 * (api/src/db/backend.ts getActiveSources: GROUP BY app_name, index_name,
 * timestamp >= now - 7 days). "Errors" there is `severity <= 3` (emergency,
 * alert, critical, error). These builders mirror that exactly so the number
 * you click and the search you land on agree.
 *
 * Kept free of React/browser imports so the API test suite can import it
 * and check the queries against the real count (api/src/db/source-drilldown.test.ts).
 */

/** Same window as the API's 7-day count. */
export const SOURCE_DRILLDOWN_EARLIEST = '-7d';

/** The API counts an error as severity 0-3. */
export const SOURCE_ERROR_CONDITION = 'severity<=3';

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Rows whose app name is missing are shown as "unknown" (the API fills NULL app
 * names with 'unknown'), so a search on app_name="unknown" would find nothing
 * while the table shows a count. Those numbers stay plain text.
 */
export function canDrillDown(appName: string | null | undefined): boolean {
  const name = (appName ?? '').trim();
  return name !== '' && name !== 'unknown';
}

export function sourceLogsQuery(indexName: string, appName: string): string {
  return `search index=${quote(indexName || 'main')} app_name=${quote(appName)}`;
}

export function sourceErrorsQuery(indexName: string, appName: string): string {
  return `${sourceLogsQuery(indexName, appName)} ${SOURCE_ERROR_CONDITION}`;
}

/** URL for the Search page: query plus the same 7-day range, auto-runs on open. */
export function searchUrl(query: string, earliest: string = SOURCE_DRILLDOWN_EARLIEST): string {
  const params = new URLSearchParams({ q: query, earliest });
  return `/search?${params.toString()}`;
}
