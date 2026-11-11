import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A real SQLite app database, set up BEFORE the modules that open it are imported.
process.env.SQLITE_PATH = join(tmpdir(), `lognog-weekly-send-${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}.db`);

import { getSQLiteDB } from '../../db/sqlite';
import { claimWeek, markWeek, maybeSendWeeklyFunnelReport, MAX_ATTEMPTS, resetWeeklyFunnelMemory, weekStatus, weeklyFunnelRecipients, sendWeeklyFunnelReport, WeeklyDeps } from './weekly-send';
import type { WeeklyFunnelReport } from './weekly';

const MONDAY_9 = new Date(Date.UTC(2026, 10, 16, 14, 0)); // Mon Nov 16 2026, 9:00 AM Eastern
const KEY = '2026-11-16';
const minutesLater = (n: number) => new Date(MONDAY_9.getTime() + n * 60_000);
const REPORT = { generatedAt: '', weekStart: '', weekEnd: '', title: '7 days to Nov 16, 2026', sections: [] } as WeeklyFunnelReport;

function deps(over: Partial<WeeklyDeps> = {}): WeeklyDeps & { build: ReturnType<typeof vi.fn>; mail: ReturnType<typeof vi.fn> } {
  return { build: vi.fn(async () => REPORT), mail: vi.fn(async () => undefined), ...over } as never;
}

const ENV = ['FUNNEL_WEEKLY_TO', 'SMTP_HOST', 'SMTP_USER'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.SMTP_HOST = 'smtp.test.invalid';
  process.env.SMTP_USER = 'user';
  process.env.FUNNEL_WEEKLY_TO = 'owner@example.test';
  getSQLiteDB().exec('DROP TABLE IF EXISTS funnel_weekly_sends');
  resetWeeklyFunnelMemory();
  // A table the old fallback used to read. Its people must never get this report.
  getSQLiteDB().exec("CREATE TABLE IF NOT EXISTS scheduled_reports_probe (recipients TEXT)");
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe('weekly funnel email: who gets it', () => {
  it('only the people named in FUNNEL_WEEKLY_TO, with bad addresses dropped', () => {
    process.env.FUNNEL_WEEKLY_TO = ' owner@example.test, not-an-address ,owner@example.test,second@example.test';
    expect(weeklyFunnelRecipients()).toEqual(['owner@example.test', 'second@example.test']);
  });

  it('nobody when it is not set: there is no fallback list', async () => {
    delete process.env.FUNNEL_WEEKLY_TO;
    expect(weeklyFunnelRecipients()).toEqual([]);
    const d = deps();
    expect(await maybeSendWeeklyFunnelReport(MONDAY_9, d)).toBeNull();
    expect(d.build).not.toHaveBeenCalled();
    expect(d.mail).not.toHaveBeenCalled();
    expect(weekStatus(KEY)).toBeNull();
    expect((await sendWeeklyFunnelReport()).sent).toBe(false);
  });

  it('nothing happens without a mail server', async () => {
    delete process.env.SMTP_HOST;
    const d = deps();
    expect(await maybeSendWeeklyFunnelReport(MONDAY_9, d)).toBeNull();
    expect(d.build).not.toHaveBeenCalled();
  });
});

describe('weekly funnel email: at most once', () => {
  it('sends once on Monday morning and never again that day', async () => {
    const d = deps();
    expect(await maybeSendWeeklyFunnelReport(MONDAY_9, d)).toMatchObject({ sent: true, recipients: 1 });
    for (let m = 1; m <= 170; m += 13) expect(await maybeSendWeeklyFunnelReport(minutesLater(m), d)).toBeNull();
    expect(d.mail).toHaveBeenCalledTimes(1);
    expect(d.build).toHaveBeenCalledTimes(1);
    expect(weekStatus(KEY)?.status).toBe('sent');
  });

  it('does not build the report (no log-store read) on any other day or hour', async () => {
    const d = deps();
    await maybeSendWeeklyFunnelReport(new Date(Date.UTC(2026, 10, 17, 14, 0)), d); // Tuesday
    await maybeSendWeeklyFunnelReport(new Date(Date.UTC(2026, 10, 16, 13, 30)), d); // Monday 8:30
    expect(d.build).not.toHaveBeenCalled();
  });

  it('a mail server that accepts the message and then errors is NOT retried', async () => {
    const d = deps({ mail: vi.fn(async () => { throw new Error('connection dropped after DATA'); }) });
    expect(await maybeSendWeeklyFunnelReport(MONDAY_9, d)).toMatchObject({ sent: false, reason: 'mail server problem' });
    for (let m = 1; m <= 170; m++) await maybeSendWeeklyFunnelReport(minutesLater(m), d);
    expect(d.mail).toHaveBeenCalledTimes(1);
    expect(weekStatus(KEY)?.status).toBe('failed');
  });

  it('a database hiccup after the message went does not send it again', async () => {
    const d = deps({
      mail: vi.fn(async () => {
        // The message is out; now make the "sent" bookkeeping fail.
        getSQLiteDB().exec('DROP TABLE funnel_weekly_sends');
      }),
    });
    await maybeSendWeeklyFunnelReport(MONDAY_9, d);
    // Even with the row gone, this process remembers it has mailed the week.
    for (let m = 1; m <= 60; m++) await maybeSendWeeklyFunnelReport(minutesLater(m), d);
    expect(d.mail).toHaveBeenCalledTimes(1);
  });

  it('a report that cannot be built is tried a few times, then left alone', async () => {
    const d = deps({ build: vi.fn(async () => { throw new Error('log store down'); }) });
    for (let m = 0; m < 170; m++) await maybeSendWeeklyFunnelReport(minutesLater(m), d);
    expect(d.build).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(d.mail).not.toHaveBeenCalled();
    expect(weekStatus(KEY)).toMatchObject({ status: 'retry', attempts: MAX_ATTEMPTS });
  });

  it('a build that fails once and then works still goes out, once', async () => {
    const build = vi.fn().mockRejectedValueOnce(new Error('blip')).mockResolvedValue(REPORT);
    const d = deps({ build });
    await maybeSendWeeklyFunnelReport(MONDAY_9, d);
    expect(await maybeSendWeeklyFunnelReport(minutesLater(1), d)).toMatchObject({ sent: true });
    await maybeSendWeeklyFunnelReport(minutesLater(2), d);
    expect(d.mail).toHaveBeenCalledTimes(1);
  });

  it('two processes sharing the database cannot both take the week', () => {
    expect(claimWeek(KEY, MONDAY_9)).toBe(true);
    expect(claimWeek(KEY, MONDAY_9)).toBe(false);
    expect(claimWeek(KEY, minutesLater(5))).toBe(false); // still being worked on
  });

  it('a claim cut off by a restart is taken over after 15 minutes, unless mail was already attempted', () => {
    expect(claimWeek(KEY, MONDAY_9)).toBe(true);
    expect(claimWeek(KEY, minutesLater(16))).toBe(true);
    markWeek(KEY, 'mailing', 1);
    expect(claimWeek(KEY, minutesLater(60))).toBe(false);
  });
});
