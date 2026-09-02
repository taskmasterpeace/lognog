/**
 * Report run history: every execution is recorded with its outcome and the
 * rendered HTML, capped per report, and exposed via the reports API.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

process.env.SQLITE_PATH = './lognog-test-report-runs.db';

const mockExecuteDSLQuery = vi.fn();
vi.mock('../db/backend.js', () => ({
  executeDSLQuery: (...args: unknown[]) => mockExecuteDSLQuery(...args),
  replayIngestSpool: vi.fn().mockResolvedValue({ batches: 0, events: 0, remaining: 0 }),
  getBackend: () => 'sqlite',
  isLiteMode: () => true,
  insertLogs: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../auth/middleware.js', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: 'u1', username: 'tester', role: 'admin' };
    next();
  },
  denyReadonly: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  rateLimit: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

import { triggerReport } from './scheduler.js';
import { listReportRuns, getReportRun, recordReportRun } from '../db/sqlite-report-runs.js';
import { getSQLiteDB } from '../db/sqlite.js';
import reportsRouter from '../routes/reports.js';

function createReport(): string {
  const id = `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  getSQLiteDB().prepare(`
    INSERT INTO scheduled_reports (id, name, query, schedule, recipients, format, enabled)
    VALUES (?, 'Nightly', 'search * | stats count by hostname', '0 2 * * *', 'ops@example.com', 'html', 1)
  `).run(id);
  return id;
}

describe('report run history', () => {
  it('records a manual run with its rendered output and serves it back', async () => {
    const id = createReport();
    mockExecuteDSLQuery.mockResolvedValue({ sql: 'SELECT 1', results: [{ hostname: 'web-01', count: 7 }] });

    const result = await triggerReport(id);
    expect(['sent', 'generated']).toContain(result.status);

    const runs = listReportRuns(id);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ report_id: id, status: result.status, manual: 1, row_count: 1 });
    expect((runs[0] as { html?: string }).html).toBeUndefined();

    const full = getReportRun(runs[0].id);
    expect(full?.html).toContain('web-01');

    const app = express();
    app.use('/reports', reportsRouter);
    const list = await request(app).get(`/reports/${id}/runs`);
    expect(list.status).toBe(200);
    expect(list.body[0].id).toBe(runs[0].id);
    const html = await request(app).get(`/reports/${id}/runs/${runs[0].id}/html`);
    expect(html.status).toBe(200);
    expect(html.text).toContain('web-01');
  });

  it('records failures and keeps only the newest runs per report', async () => {
    const id = createReport();
    mockExecuteDSLQuery.mockRejectedValueOnce(new Error('boom'));
    const failed = await triggerReport(id);
    expect(failed.status).toBe('error');
    expect(listReportRuns(id)[0]).toMatchObject({ status: 'error', reason: 'boom' });

    for (let i = 0; i < 60; i++) {
      recordReportRun({ report_id: id, started_at: new Date(Date.now() + i).toISOString(), status: 'sent', manual: false, row_count: i, duration_ms: 1 });
    }
    expect(listReportRuns(id, 100)).toHaveLength(50);
  });
});
