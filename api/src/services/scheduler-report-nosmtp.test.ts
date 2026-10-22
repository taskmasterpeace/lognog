/**
 * Key lock round 9: with no mail server set up, a report run that fails after
 * the e-mail was built (recording the run, updating last_run...) is logged as
 * failing in the 'finish' step, not 'render', and a failure while building it
 * is still 'render'. The step picks the phrase and is written as failed_step.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
  process.env.SQLITE_PATH = './lognog-test-scheduler-report-nosmtp.db';
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  return {
    executeDSLQuery: vi.fn(),
    renderError: null as Error | null,
    failGeneratedLog: false,
    reportLogs: [] as Array<Record<string, unknown>>,
  };
});

vi.mock('../db/backend.js', () => ({
  executeDSLQuery: (...args: unknown[]) => h.executeDSLQuery(...args),
  replayIngestSpool: vi.fn().mockResolvedValue({ batches: 0, events: 0, remaining: 0 }),
  getBackend: () => 'sqlite',
  isLiteMode: () => true,
  insertLogs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./report-renderer.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./report-renderer.js')>();
  return {
    ...real,
    renderHtml: (...args: Parameters<typeof real.renderHtml>) => {
      if (h.renderError) throw h.renderError;
      return real.renderHtml(...args);
    },
  };
});

// Watch what the scheduler hands the internal log, and make the "generated"
// entry (written after the e-mail is built) fail when a test asks for it.
vi.mock('./internal-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./internal-logger.js')>();
  return {
    ...real,
    logReportGenerated: (data: Parameters<typeof real.logReportGenerated>[0]) => {
      h.reportLogs.push({ ...data });
      if (h.failGeneratedLog && !data.error) {
        h.failGeneratedLog = false;
        throw new Error('kl-r9 could not record the run');
      }
      return real.logReportGenerated(data);
    },
  };
});

import { triggerReport, isSmtpConfigured } from './scheduler.js';
import { listReportRuns } from '../db/sqlite-report-runs.js';
import { getSQLiteDB } from '../db/sqlite.js';

function createReport(): string {
  const id = `rn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  getSQLiteDB().prepare(`
    INSERT INTO scheduled_reports (id, name, query, schedule, recipients, format, enabled)
    VALUES (?, 'No mail check', 'search * | stats count by hostname', '0 2 * * *', 'kl-r9@example.invalid', 'html', 1)
  `).run(id);
  return id;
}

let lines: string[] = [];
const capture = (...args: unknown[]) => {
  lines.push(args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
};

beforeEach(() => {
  lines = [];
  h.reportLogs = [];
  h.renderError = null;
  h.failGeneratedLog = false;
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
  h.executeDSLQuery.mockReset();
  h.executeDSLQuery.mockResolvedValue({ sql: 'SELECT 1', results: [{ hostname: 'web-01', count: 3 }] });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('report runs with no mail server set up (key lock round 9)', () => {
  it('runs without a mail server: the report is generated, not sent', async () => {
    expect(isSmtpConfigured()).toBe(false);
    const result = await triggerReport(createReport());
    expect(result.status).toBe('generated');
    expect(h.reportLogs).toHaveLength(1);
    expect(h.reportLogs[0].error).toBeUndefined();
  });

  it("a failure after the e-mail was built is the 'finish' step, not 'render'", async () => {
    h.failGeneratedLog = true;
    const id = createReport();
    const result = await triggerReport(id);
    expect(result.status).toBe('error');
    const failed = h.reportLogs.filter((d) => d.error);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ error: 'kl-r9 could not record the run', stage: 'finish' });
    expect(lines.join('\n')).toContain('Error running report "No mail check": Report failed (details in the run history)');
    expect(listReportRuns(id)[0]).toMatchObject({ status: 'error', reason: 'kl-r9 could not record the run' });
  });

  it("a failure while building the e-mail is still the 'render' step", async () => {
    h.renderError = new Error('kl-r9 template broke');
    const result = await triggerReport(createReport());
    expect(result.status).toBe('error');
    const failed = h.reportLogs.filter((d) => d.error);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ stage: 'render' });
  });

  it("a failed search is the 'search' step", async () => {
    h.executeDSLQuery.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8123'));
    const result = await triggerReport(createReport());
    expect(result.status).toBe('error');
    const failed = h.reportLogs.filter((d) => d.error);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ stage: 'search' });
    expect(lines.join('\n')).toContain(`The report's search failed`);
  });
});
