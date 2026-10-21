/**
 * Data Sources drill-downs: the "Logs (7d)" and "Errors" numbers on the
 * Active Sources table open Search with a query built by the UI
 * (ui/src/utils/sourceDrilldown.ts). This runs those exact queries through
 * the real DSL engine (SQLite/Lite) and checks they find the same number of
 * logs the table shows, so the count and the drill-down share one definition.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

process.env.LOGNOG_BACKEND = 'sqlite';
process.env.LOGS_DB_PATH = join(
  tmpdir(),
  `lognog-drilldown-test-${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}.db`,
);

import { insertLogs, getActiveSources, executeDSLQuery } from './backend';

// The UI module is loaded by path at run time so the API's tsc build (rootDir
// src/) never pulls a UI file into its program. Its shape is declared here.
interface DrilldownModule {
  sourceLogsQuery(indexName: string, appName: string): string;
  sourceErrorsQuery(indexName: string, appName: string): string;
  searchUrl(query: string, earliest?: string): string;
  SOURCE_DRILLDOWN_EARLIEST: string;
}
const UI_MODULE = resolve(__dirname, '../../../ui/src/utils/sourceDrilldown.ts');
let sourceLogsQuery: DrilldownModule['sourceLogsQuery'];
let sourceErrorsQuery: DrilldownModule['sourceErrorsQuery'];
let searchUrl: DrilldownModule['searchUrl'];
let SOURCE_DRILLDOWN_EARLIEST: string;

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}
const HOUR = 3600_000;
const DAY = 24 * HOUR;

async function countOf(query: string): Promise<number> {
  const { results } = await executeDSLQuery<{ count: number }>(`${query} | stats count`, {
    earliest: SOURCE_DRILLDOWN_EARLIEST,
  });
  return Number(results[0]?.count ?? 0);
}

describe('Data Sources drill-down queries match the Active Sources counts', () => {
  beforeAll(async () => {
    const ui = (await import(/* @vite-ignore */ UI_MODULE)) as DrilldownModule;
    ({ sourceLogsQuery, sourceErrorsQuery, searchUrl, SOURCE_DRILLDOWN_EARLIEST } = ui);

    const rows: Record<string, unknown>[] = [];
    const add = (index_name: string, app_name: string, hostname: string, severity: number, ts: string) =>
      rows.push({ timestamp: ts, index_name, app_name, hostname, severity, message: `${app_name} sev ${severity}` });

    // web/nginx on two hosts: 4 recent (1 error, 1 critical), 1 error 8 days old (outside the window)
    add('web', 'nginx', 'web-01', 6, ago(1 * HOUR));
    add('web', 'nginx', 'web-02', 3, ago(2 * HOUR));
    add('web', 'nginx', 'web-01', 2, ago(3 * DAY));
    add('web', 'nginx', 'web-02', 4, ago(6 * DAY));
    add('web', 'nginx', 'web-01', 3, ago(8 * DAY));
    // same app name in another index must not leak into the web row
    add('infra', 'nginx', 'edge-01', 3, ago(1 * HOUR));
    // an app name with a space and a quote
    add('infra', 'my "odd" app', 'edge-01', 5, ago(1 * HOUR));
    add('infra', 'my "odd" app', 'edge-01', 0, ago(1 * HOUR));
    // warning (4) is not an error
    add('infra', 'cron', 'edge-02', 4, ago(1 * HOUR));
    await insertLogs(rows);
  });

  it('every row: Logs (7d) and Errors equal what the drill-down search finds', async () => {
    const { sources } = await getActiveSources();
    expect(sources.length).toBe(4);

    for (const s of sources) {
      expect(await countOf(sourceLogsQuery(s.index_name, s.app_name))).toBe(Number(s.log_count));
      expect(await countOf(sourceErrorsQuery(s.index_name, s.app_name))).toBe(Number(s.error_count));
    }

    const web = sources.find(s => s.index_name === 'web' && s.app_name === 'nginx')!;
    expect(Number(web.log_count)).toBe(4);
    expect(Number(web.error_count)).toBe(2);
    const odd = sources.find(s => s.app_name === 'my "odd" app')!;
    expect(Number(odd.error_count)).toBe(1);
    const cron = sources.find(s => s.app_name === 'cron')!;
    expect(Number(cron.error_count)).toBe(0);
  });

  it('builds the Search URL with the query and the same 7-day range', () => {
    const url = searchUrl(sourceErrorsQuery('web', 'nginx'));
    const params = new URLSearchParams(url.split('?')[1]);
    expect(url.startsWith('/search?')).toBe(true);
    expect(params.get('q')).toBe('search index="web" app_name="nginx" severity<=3');
    expect(params.get('earliest')).toBe('-7d');
    expect(sourceLogsQuery('', 'x')).toBe('search index="main" app_name="x"');
  });
});
