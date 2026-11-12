import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A real SQLite app database, set up BEFORE the modules that open it are imported.
process.env.SQLITE_PATH = join(tmpdir(), `lognog-weekly-send-${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}.db`);

import { getSQLiteDB } from '../../db/sqlite';
import {
  claimWeek, FALLBACK_MAX, markWeek, maybeSendWeeklyFunnelReport, MAX_ATTEMPTS, resetWeeklyFunnelMemory, resolveWeeklyRecipients,
  weekStatus, weeklyFunnelBaseUrl, weeklyFunnelRecipients, sendWeeklyFunnelReport, WeeklyDeps,
} from './weekly-send';
import type { WeeklyFunnelReport } from './weekly';

const MONDAY_9 = new Date(Date.UTC(2026, 10, 16, 14, 0)); // Mon Nov 16 2026, 9:00 AM Eastern
const KEY = '2026-11-16';
const minutesLater = (n: number) => new Date(MONDAY_9.getTime() + n * 60_000);
const REPORT = { generatedAt: '', weekStart: '', weekEnd: '', title: '7 days to Nov 16, 2026', sections: [] } as WeeklyFunnelReport;

function deps(over: Partial<WeeklyDeps> = {}): WeeklyDeps & { build: ReturnType<typeof vi.fn>; mail: ReturnType<typeof vi.fn> } {
  return { build: vi.fn(async () => REPORT), mail: vi.fn(async () => undefined), ...over } as never;
}

const ENV = ['FUNNEL_WEEKLY_TO', 'SMTP_HOST', 'SMTP_USER', 'PUBLIC_URL', 'LOGNOG_PUBLIC_URL'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) saved[k] = process.env[k];
  process.env.SMTP_HOST = 'smtp.test.invalid';
  process.env.SMTP_USER = 'user';
  process.env.FUNNEL_WEEKLY_TO = 'owner@example.test';
  getSQLiteDB().exec('DROP TABLE IF EXISTS funnel_weekly_sends');
  resetWeeklyFunnelMemory();
  getSQLiteDB().exec('DELETE FROM scheduled_reports');
  delete process.env.PUBLIC_URL;
  delete process.env.LOGNOG_PUBLIC_URL;
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

  it('nobody when it is not set and no scheduled report has a recipient', async () => {
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

function addReport(recipients: string, enabled = 1): void {
  getSQLiteDB()
    .prepare('INSERT INTO scheduled_reports (id, name, query, schedule, recipients, enabled) VALUES (?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), 'A report', 'search *', '0 9 * * 1', recipients, enabled);
}

describe('weekly funnel email: the fallback list', () => {
  it('the setting always wins, even when scheduled reports have recipients', () => {
    addReport('someone-else@example.test');
    process.env.FUNNEL_WEEKLY_TO = 'owner@example.test';
    expect(resolveWeeklyRecipients()).toEqual({ list: ['owner@example.test'], source: 'setting' });
  });

  it('a setting with only unusable addresses sends to nobody; it does not fall back', () => {
    addReport('someone-else@example.test');
    process.env.FUNNEL_WEEKLY_TO = 'not-an-address';
    const r = resolveWeeklyRecipients();
    expect(r.list).toEqual([]);
    expect(r.source).toBe('none');
  });

  it('with no setting it uses the enabled scheduled reports: valid addresses only, no repeats', () => {
    delete process.env.FUNNEL_WEEKLY_TO;
    addReport('Owner@Example.test, owner@example.test, broken@, second@example.test');
    addReport('disabled@example.test', 0);
    const r = resolveWeeklyRecipients();
    expect(r).toEqual({ list: ['Owner@Example.test', 'second@example.test'], source: 'scheduled_reports' });
    expect(weeklyFunnelRecipients()).toHaveLength(2);
  });

  it('a disabled report alone gives nobody', () => {
    delete process.env.FUNNEL_WEEKLY_TO;
    addReport('disabled@example.test', 0);
    expect(resolveWeeklyRecipients()).toMatchObject({ list: [], source: 'none' });
  });

  it('refuses a fallback list bigger than the cap, so a large list never gets business numbers by default', () => {
    delete process.env.FUNNEL_WEEKLY_TO;
    addReport(Array.from({ length: FALLBACK_MAX + 1 }, (_, i) => `p${i}@example.test`).join(','));
    const r = resolveWeeklyRecipients();
    expect(r.list).toEqual([]);
    expect(r.source).toBe('none');
    expect(r.reason).toMatch(/more than the 3 allowed/);
    expect(r.reason).not.toMatch(/@/);
  });

  it('exactly the cap is allowed', () => {
    delete process.env.FUNNEL_WEEKLY_TO;
    addReport(Array.from({ length: FALLBACK_MAX }, (_, i) => `p${i}@example.test`).join(','));
    expect(resolveWeeklyRecipients().list).toHaveLength(FALLBACK_MAX);
  });

  it('the Monday job mails the fallback list and logs how many, never who', async () => {
    delete process.env.FUNNEL_WEEKLY_TO;
    addReport('owner@example.test');
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')); });
    const d = deps();
    expect(await maybeSendWeeklyFunnelReport(MONDAY_9, d)).toMatchObject({ sent: true, recipients: 1 });
    expect(d.mail).toHaveBeenCalledWith(REPORT, ['owner@example.test']);
    expect(logs.join(' | ')).toMatch(/sent to 1 \(list from scheduled_reports\)/);
    expect(logs.join(' | ')).not.toMatch(/@/);
  });

  it('a dry run says how many and from where, builds nothing and sends nothing', async () => {
    delete process.env.FUNNEL_WEEKLY_TO;
    addReport('owner@example.test');
    const r = await sendWeeklyFunnelReport({ dryRun: true });
    expect(r).toEqual({ sent: false, dryRun: true, recipients: 1, source: 'scheduled_reports', reason: undefined });
    expect(JSON.stringify(r)).not.toMatch(/@/);
    expect(weekStatus(KEY)).toBeNull();
  });
});

describe('weekly funnel email: the link', () => {
  it('uses PUBLIC_URL when set, without a trailing slash', () => {
    process.env.PUBLIC_URL = 'https://logs.example.test/';
    expect(weeklyFunnelBaseUrl()).toBe('https://logs.example.test');
  });

  it('falls back to the production address when nothing is set', () => {
    expect(weeklyFunnelBaseUrl()).toBe('https://logs.machinekinglabs.com');
  });
});
