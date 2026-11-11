/**
 * Sends the weekly funnel report by email, once per Monday (Eastern).
 *
 * Who gets it: FUNNEL_WEEKLY_TO (comma-separated). If that is not set, the
 * people who already receive LogNog's scheduled reports. If there is nobody,
 * or no mail server is configured, nothing is sent and the reason is logged.
 */
import nodemailer from 'nodemailer';
import { getSQLiteDB } from '../../db/sqlite.js';
import { getWeeklyFunnelReport, renderWeeklyFunnelEmail, weeklyFunnelDue, weeklyFunnelLogoAttachments, WeeklyFunnelReport } from './weekly.js';

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

function ensureTable(): void {
  getSQLiteDB().exec(`
    CREATE TABLE IF NOT EXISTS funnel_weekly_sends (
      week_key TEXT PRIMARY KEY,
      sent_at TEXT NOT NULL,
      recipients INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL
    )
  `);
}

export function lastWeeklyFunnelSend(): string | null {
  ensureTable();
  const row = getSQLiteDB().prepare("SELECT week_key FROM funnel_weekly_sends WHERE status = 'sent' ORDER BY week_key DESC LIMIT 1").get() as { week_key: string } | undefined;
  return row?.week_key ?? null;
}

/** Claim a week so two ticks (or two API processes) cannot both send it. Returns false if it was already claimed. */
function claimWeek(weekKey: string): boolean {
  ensureTable();
  const info = getSQLiteDB()
    .prepare("INSERT OR IGNORE INTO funnel_weekly_sends (week_key, sent_at, recipients, status) VALUES (?, ?, 0, 'sending')")
    .run(weekKey, new Date().toISOString());
  return info.changes === 1;
}

function finishWeek(weekKey: string, status: 'sent' | 'failed', recipients: number): void {
  if (status === 'failed') {
    // Let the next tick inside the Monday window try again.
    getSQLiteDB().prepare('DELETE FROM funnel_weekly_sends WHERE week_key = ?').run(weekKey);
    return;
  }
  getSQLiteDB().prepare('UPDATE funnel_weekly_sends SET status = ?, recipients = ?, sent_at = ? WHERE week_key = ?').run(status, recipients, new Date().toISOString(), weekKey);
}

export function weeklyFunnelRecipients(): string[] {
  const fromEnv = (process.env.FUNNEL_WEEKLY_TO || '').split(',').map((s) => s.trim()).filter((s) => EMAIL.test(s));
  if (fromEnv.length > 0) return [...new Set(fromEnv)];
  try {
    const rows = getSQLiteDB().prepare('SELECT recipients FROM scheduled_reports WHERE enabled = 1').all() as Array<{ recipients: string | null }>;
    const found = rows.flatMap((r) => String(r.recipients || '').split(',')).map((s) => s.trim()).filter((s) => EMAIL.test(s));
    return [...new Set(found)];
  } catch {
    return [];
  }
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

/** Build the report from live data and email it now. Does not check the day or whether it was already sent. */
export async function sendWeeklyFunnelReport(to?: string[]): Promise<WeeklySendResult & { report: WeeklyFunnelReport }> {
  const report = await getWeeklyFunnelReport();
  const recipients = (to && to.length ? to : weeklyFunnelRecipients()).filter((s) => EMAIL.test(s));
  if (!mailConfigured()) return { sent: false, recipients: 0, reason: 'No mail server is set up (SMTP_HOST / SMTP_USER).', report, title: report.title };
  if (recipients.length === 0) return { sent: false, recipients: 0, reason: 'Nobody to send it to (set FUNNEL_WEEKLY_TO).', report, title: report.title };

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
  return { sent: true, recipients: recipients.length, report, title: report.title };
}

let running = false;

/** Called every minute by the scheduler. Sends on Monday 9:00 AM Eastern, once. Never throws. */
export async function maybeSendWeeklyFunnelReport(now: Date = new Date()): Promise<WeeklySendResult | null> {
  if (running) return null;
  running = true;
  let key: string | null = null;
  try {
    const due = weeklyFunnelDue(now, lastWeeklyFunnelSend());
    if (!due.due) return null;
    if (!mailConfigured() || weeklyFunnelRecipients().length === 0) return null;
    if (!claimWeek(due.key)) return null;
    key = due.key;
    const result = await sendWeeklyFunnelReport();
    finishWeek(due.key, result.sent ? 'sent' : 'failed', result.recipients);
    console.log(`[Funnels] Weekly report for ${due.key}: ${result.sent ? `sent to ${result.recipients}` : `not sent (${result.reason})`}`);
    return { sent: result.sent, recipients: result.recipients, reason: result.reason, title: result.title };
  } catch (error) {
    console.error('[Funnels] Weekly report failed:', error instanceof Error ? error.message : error);
    if (key) {
      try {
        finishWeek(key, 'failed', 0);
      } catch {
        /* nothing more to do */
      }
    }
    return { sent: false, recipients: 0, reason: 'error' };
  } finally {
    running = false;
  }
}
