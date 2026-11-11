/**
 * Sends the weekly funnel report by email, once per Monday (Eastern).
 *
 * Who gets it: only the addresses in FUNNEL_WEEKLY_TO (comma-separated). If it
 * is not set, nothing is sent: revenue and customer numbers never go to anyone
 * who was not named for them.
 *
 * At most once: the week is claimed in the database before anything else. A
 * problem BEFORE the mail server is called (cannot build the report) lets the
 * next minute try again, up to MAX_ATTEMPTS times. Once the mail server has
 * been called the week is closed whatever happens next, because the message
 * may have gone; a possible missed week is better than a hundred copies.
 */
import nodemailer from 'nodemailer';
import { getSQLiteDB } from '../../db/sqlite.js';
import { getWeeklyFunnelReport, renderWeeklyFunnelEmail, weeklyFunnelDue, weeklyFunnelLogoAttachments, WeeklyFunnelReport } from './weekly.js';

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
/** Tries per Monday at building the report before giving up on the week. */
export const MAX_ATTEMPTS = 3;
/** A claim older than this with no outcome was cut off (restart mid-send); it may be taken over. */
const STALE_CLAIM_MS = 15 * 60 * 1000;

type WeekStatus = 'building' | 'retry' | 'mailing' | 'sent' | 'failed';

function ensureTable(): void {
  getSQLiteDB().exec(`
    CREATE TABLE IF NOT EXISTS funnel_weekly_sends (
      week_key TEXT PRIMARY KEY,
      sent_at TEXT NOT NULL,
      recipients INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 1
    )
  `);
}

/**
 * Take this week, or take it back after an earlier try failed before any mail
 * was attempted. Returns false when someone else has it, it is finished, or
 * the tries are used up. One statement, so two processes cannot both win.
 */
export function claimWeek(weekKey: string, now: Date = new Date()): boolean {
  ensureTable();
  const db = getSQLiteDB();
  const stamp = now.toISOString();
  const fresh = db
    .prepare("INSERT OR IGNORE INTO funnel_weekly_sends (week_key, sent_at, recipients, status, attempts) VALUES (?, ?, 0, 'building', 1)")
    .run(weekKey, stamp);
  if (fresh.changes === 1) return true;
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
  const again = db
    .prepare(
      `UPDATE funnel_weekly_sends SET status = 'building', attempts = attempts + 1, sent_at = ?
       WHERE week_key = ? AND attempts < ? AND (status = 'retry' OR (status = 'building' AND sent_at < ?))`,
    )
    .run(stamp, weekKey, MAX_ATTEMPTS, staleBefore);
  return again.changes === 1;
}

export function markWeek(weekKey: string, status: WeekStatus, recipients = 0): void {
  getSQLiteDB().prepare('UPDATE funnel_weekly_sends SET status = ?, recipients = ?, sent_at = ? WHERE week_key = ?').run(status, recipients, new Date().toISOString(), weekKey);
}

export function weekStatus(weekKey: string): { status: WeekStatus; attempts: number } | null {
  ensureTable();
  const row = getSQLiteDB().prepare('SELECT status, attempts FROM funnel_weekly_sends WHERE week_key = ?').get(weekKey) as { status: WeekStatus; attempts: number } | undefined;
  return row ?? null;
}

/** Only the people named in FUNNEL_WEEKLY_TO. No fallback. */
export function weeklyFunnelRecipients(): string[] {
  const named = (process.env.FUNNEL_WEEKLY_TO || '').split(',').map((s) => s.trim()).filter((s) => EMAIL.test(s));
  return [...new Set(named)];
}

function mailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER);
}

export interface WeeklySendResult {
  sent: boolean;
  recipients: number;
  reason?: string;
  title?: string;
}

/** Hand a built report to the mail server. Separate so the caller knows exactly when mail was attempted. */
export async function mailWeeklyFunnelReport(report: WeeklyFunnelReport, recipients: string[]): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  const base = (process.env.PUBLIC_URL || process.env.LOGNOG_PUBLIC_URL || '').replace(/\/+$/, '');
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@lognog.local',
    to: recipients.join(', '),
    subject: `Weekly funnel report: ${report.title}`,
    html: renderWeeklyFunnelEmail(report, base ? `${base}/funnels/weekly` : undefined),
    attachments: weeklyFunnelLogoAttachments(report),
  });
}

/** Build the report from live data and email it now (the admin "send now" button). Does not look at the day or at earlier sends. */
export async function sendWeeklyFunnelReport(): Promise<WeeklySendResult> {
  const recipients = weeklyFunnelRecipients();
  if (!mailConfigured()) return { sent: false, recipients: 0, reason: 'No mail server is set up (SMTP_HOST / SMTP_USER).' };
  if (recipients.length === 0) return { sent: false, recipients: 0, reason: 'Nobody to send it to: set FUNNEL_WEEKLY_TO.' };
  const report = await getWeeklyFunnelReport();
  await mailWeeklyFunnelReport(report, recipients);
  return { sent: true, recipients: recipients.length, title: report.title };
}

let running = false;
let saidNoRecipientsFor = '';
/** Weeks this process has already handed to the mail server. A second guard beside the database row, in case that row is lost. */
const mailedWeeks = new Set<string>();

/** Test hook: forget what this process has mailed. */
export function resetWeeklyFunnelMemory(): void {
  mailedWeeks.clear();
  saidNoRecipientsFor = '';
}

export interface WeeklyDeps {
  build: () => Promise<WeeklyFunnelReport>;
  mail: (report: WeeklyFunnelReport, recipients: string[]) => Promise<void>;
}
const REAL: WeeklyDeps = { build: () => getWeeklyFunnelReport(), mail: mailWeeklyFunnelReport };

/** Called every minute by the scheduler. Sends on Monday from 9:00 AM Eastern, once. Never throws. */
export async function maybeSendWeeklyFunnelReport(now: Date = new Date(), deps: WeeklyDeps = REAL): Promise<WeeklySendResult | null> {
  if (running) return null;
  running = true;
  try {
    // Cheap checks first: nothing below touches the log store unless a send is really due.
    const due = weeklyFunnelDue(now, null);
    if (!due.due) return null;
    if (!mailConfigured()) return null;
    const recipients = weeklyFunnelRecipients();
    if (recipients.length === 0) {
      if (saidNoRecipientsFor !== due.key) {
        saidNoRecipientsFor = due.key;
        console.log('[Funnels] Weekly report not sent: FUNNEL_WEEKLY_TO is not set.');
      }
      return null;
    }
    if (mailedWeeks.has(due.key)) return null;
    if (!claimWeek(due.key, now)) return null;

    let report: WeeklyFunnelReport;
    try {
      report = await deps.build();
    } catch (error) {
      // Nothing was mailed. Let a later minute try again (claimWeek caps the tries).
      markWeek(due.key, 'retry');
      console.error('[Funnels] Weekly report could not be built:', error instanceof Error ? error.message : error);
      return { sent: false, recipients: 0, reason: 'could not build the report' };
    }

    // From here the message may reach people, so this week is never retried.
    mailedWeeks.add(due.key);
    markWeek(due.key, 'mailing', recipients.length);
    try {
      await deps.mail(report, recipients);
    } catch (error) {
      try {
        markWeek(due.key, 'failed', recipients.length);
      } catch {
        /* the 'mailing' mark already closes the week */
      }
      console.error('[Funnels] Weekly report: the mail server reported a problem; not retrying this week:', error instanceof Error ? error.message : error);
      return { sent: false, recipients: recipients.length, reason: 'mail server problem', title: report.title };
    }
    try {
      markWeek(due.key, 'sent', recipients.length);
    } catch {
      /* the 'mailing' mark already closes the week */
    }
    console.log(`[Funnels] Weekly report for ${due.key} sent to ${recipients.length}.`);
    return { sent: true, recipients: recipients.length, title: report.title };
  } catch (error) {
    console.error('[Funnels] Weekly report failed:', error instanceof Error ? error.message : error);
    return { sent: false, recipients: 0, reason: 'error' };
  } finally {
    running = false;
  }
}
