/**
 * Report run history: one row per execution of a scheduled report (manual or
 * scheduled) with the outcome and the rendered output, so users can see what
 * was sent, to whom, and open the last result without re-running it.
 */

import { getSQLiteDB } from './sqlite.js';
import { v4 as uuidv4 } from 'uuid';

export interface ReportRun {
  id: string;
  report_id: string;
  started_at: string;
  finished_at: string;
  status: 'sent' | 'skipped' | 'generated' | 'error';
  manual: number;
  row_count: number;
  recipients: string | null;
  reason: string | null;
  duration_ms: number;
  /** Rendered HTML (capped); NULL when the run produced nothing. */
  html: string | null;
}

// Keep the SQLite file bounded: cap stored HTML and prune per report.
const MAX_HTML_BYTES = 512 * 1024;
const RUNS_KEPT_PER_REPORT = 50;

export function recordReportRun(run: {
  report_id: string;
  started_at: string;
  status: ReportRun['status'];
  manual: boolean;
  row_count: number;
  recipients?: string[];
  reason?: string;
  duration_ms: number;
  html?: string;
}): ReportRun {
  const database = getSQLiteDB();
  const id = uuidv4();
  const html = run.html && run.html.length > MAX_HTML_BYTES
    ? run.html.slice(0, MAX_HTML_BYTES) + '\n<!-- truncated -->'
    : run.html ?? null;
  database.prepare(`
    INSERT INTO report_runs (id, report_id, started_at, finished_at, status, manual, row_count, recipients, reason, duration_ms, html)
    VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, run.report_id, run.started_at, run.status, run.manual ? 1 : 0, run.row_count,
    run.recipients?.join(', ') ?? null, run.reason ?? null, run.duration_ms, html
  );
  database.prepare(`
    DELETE FROM report_runs WHERE report_id = ? AND id NOT IN (
      SELECT id FROM report_runs WHERE report_id = ? ORDER BY started_at DESC LIMIT ?
    )
  `).run(run.report_id, run.report_id, RUNS_KEPT_PER_REPORT);
  return getReportRun(id)!;
}

/** Runs for a report, newest first, without the HTML payload. */
export function listReportRuns(reportId: string, limit = 20): Omit<ReportRun, 'html'>[] {
  return getSQLiteDB().prepare(`
    SELECT id, report_id, started_at, finished_at, status, manual, row_count, recipients, reason, duration_ms
    FROM report_runs WHERE report_id = ? ORDER BY started_at DESC LIMIT ?
  `).all(reportId, limit) as Omit<ReportRun, 'html'>[];
}

export function getReportRun(id: string): ReportRun | undefined {
  return getSQLiteDB().prepare('SELECT * FROM report_runs WHERE id = ?').get(id) as ReportRun | undefined;
}
