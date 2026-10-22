/**
 * Key lock round 7: the scheduler's console lines for report runs carry no
 * e-mail addresses and no mail-server reply text. Container logs can be
 * shipped into a searchable index, and report addresses are hidden from keys
 * without 'admin' on /reports. The full reason stays in the run history,
 * which only admins can read.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
  process.env.SQLITE_PATH = './lognog-test-scheduler-report-console.db';
  process.env.SMTP_HOST = 'smtp.kl-test.invalid';
  process.env.SMTP_USER = 'kl-test-user';
  process.env.SMTP_PASS = 'kl-test-pass';
  return { sendMail: vi.fn(), executeDSLQuery: vi.fn() };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: h.sendMail }) },
  createTransport: () => ({ sendMail: h.sendMail }),
}));
vi.mock('../db/backend.js', () => ({
  executeDSLQuery: (...args: unknown[]) => h.executeDSLQuery(...args),
  replayIngestSpool: vi.fn().mockResolvedValue({ batches: 0, events: 0, remaining: 0 }),
  getBackend: () => 'sqlite',
  isLiteMode: () => true,
  insertLogs: vi.fn().mockResolvedValue(undefined),
}));

import { triggerReport } from './scheduler.js';
import { listReportRuns } from '../db/sqlite-report-runs.js';
import { getSQLiteDB } from '../db/sqlite.js';

const ADDRS = 'kl-alice@example.com, kl-bob@example.org';

function createReport(): string {
  const id = `rc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  getSQLiteDB().prepare(`
    INSERT INTO scheduled_reports (id, name, query, schedule, recipients, format, enabled)
    VALUES (?, 'Console check', 'search * | stats count by hostname', '0 2 * * *', ?, 'html', 1)
  `).run(id, ADDRS);
  return id;
}

let lines: string[] = [];
const capture = (...args: unknown[]) => {
  lines.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
};

beforeEach(() => {
  lines = [];
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
  vi.spyOn(console, 'warn').mockImplementation(capture);
  h.sendMail.mockReset();
  h.executeDSLQuery.mockReset();
  h.executeDSLQuery.mockResolvedValue({ sql: 'SELECT 1', results: [{ hostname: 'web-01', count: 3 }] });
});
afterEach(() => {
  vi.restoreAllMocks();
});

function expectClean(text: string) {
  expect(text).not.toMatch(/@|%40|＠/);
  expect(text).not.toContain('kl-alice');
  expect(text).not.toContain('kl-bob');
  expect(text).not.toContain('550');
  expect(text).not.toContain('535');
  expect(text).not.toMatch(/mailbox/i);
  expect(text).not.toContain('kl-secret');
}

describe('scheduler report console lines (key lock round 7)', () => {
  it('a sent report logs only how many recipients it went to', async () => {
    h.sendMail.mockResolvedValue({ messageId: 'x' });
    const id = createReport();
    const result = await triggerReport(id);
    expect(result.status).toBe('sent');
    expect(h.sendMail).toHaveBeenCalledTimes(1);
    const text = lines.join('\n');
    expect(text).toContain('Report "Console check" sent to 2 recipients');
    expectClean(text);
  });

  it('a refused recipient logs a fixed phrase; the run history keeps the full reason', async () => {
    const raw = 'Can not send mail to kl-bob@example.org: 550 5.1.1 User unknown in virtual mailbox table kl-secret-tbl';
    h.sendMail.mockRejectedValue(new Error(raw));
    const id = createReport();
    const result = await triggerReport(id);
    expect(result.status).toBe('error');
    const text = lines.join('\n');
    expect(text).toContain('Error running report "Console check": Mail server refused a recipient');
    expectClean(text);
    expect(listReportRuns(id)[0]).toMatchObject({ status: 'error', reason: raw });
  });

  it('a refused login and a reply with no colon also stay out of the console', async () => {
    for (const raw of [
      'Invalid login: 535 5.7.8 Username and Password not accepted for kl-alice@example.com',
      'Message failed 550 5.1.1 User unknown in virtual mailbox table kl-bob@example.org',
      'x'.repeat(5000) + ' kl-secret-long kl-alice＠example.com',
    ]) {
      lines = [];
      h.sendMail.mockRejectedValueOnce(new Error(raw));
      const id = createReport();
      const result = await triggerReport(id);
      expect(result.status).toBe('error');
      const text = lines.join('\n');
      expect(text).toContain('Error running report "Console check": ');
      expectClean(text);
      expect(text.length).toBeLessThan(400);
      expect(listReportRuns(id)[0].reason).toBe(raw);
    }
  });
});
