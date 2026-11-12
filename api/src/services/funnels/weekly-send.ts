/**
 * Sends the weekly funnel report by email, once per Monday (Eastern).
 *
 * Who gets it (resolveWeeklyRecipients):
 *  1. FUNNEL_WEEKLY_TO (comma-separated), when it is set. It always wins.
 *  2. Otherwise, the people who already receive LogNog's ENABLED scheduled
 *     reports, but only when BOTH hold:
 *       - only admins can edit scheduled reports (no ordinary `user` account
 *         exists; read-only accounts cannot edit). Otherwise a non-admin could
 *         add an address to a report and so pick who gets the business numbers.
 *       - it is a small list (FALLBACK_MAX or fewer), so a big distribution
 *         list never receives revenue and customer numbers by default.
 *  3. Otherwise nobody, and nothing is sent.
 * Addresses are never written to the log or returned: only how many, and a
 * mail error is logged by its code, not its text (which can quote an address).
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

// A plain address only: letters, digits and . _ % + - before the @, a dotted host after. No comments, groups or quotes.
const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** What is safe to log about a mail failure: its code, never its text (which can quote an address). */
export function mailErrorCode(error: unknown): string {
  const e = error as { code?: unknown; responseCode?: unknown } | null;
  const code = e && typeof e.code === 'string' ? e.code : '';
  const response = e && typeof e.responseCode === 'number' ? String(e.responseCode) : '';
  return [code, response].filter(Boolean).join(' ').replace(/[^A-Za-z0-9_ -]/g, '').slice(0, 40) || 'unknown';
}
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

/** The most people the fallback may reach. More than this and nothing is sent until FUNNEL_WEEKLY_TO names them. */
export const FALLBACK_MAX = 3;

export type RecipientSource = 'setting' | 'scheduled_reports' | 'none';
export interface ResolvedRecipients {
  list: string[];
  source: RecipientSource;
  /** Why nobody was resolved, in plain words. */
  reason?: string;
}

function validUnique(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const address = item.trim();
    const key = address.toLowerCase();
    if (!EMAIL.test(address) || seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
}

/** Who the weekly report goes to, and where that list came from. Never throws. */
export function resolveWeeklyRecipients(): ResolvedRecipients {
  const setting = (process.env.FUNNEL_WEEKLY_TO || '').trim();
  if (setting) {
    // The setting always wins, even when every address in it is unusable:
    // a typo there must not quietly switch to a different list.
    const named = validUnique(setting.split(','));
    return named.length > 0 ? { list: named, source: 'setting' } : { list: [], source: 'none', reason: 'FUNNEL_WEEKLY_TO is set but holds no usable address.' };
  }
  let rows: Array<{ recipients: string | null }>;
  try {
    const db = getSQLiteDB();
    // Scheduled reports can be edited by any account that is not read-only. The
    // fallback is only trusted while every such account is an admin.
    const others = db.prepare("SELECT count(*) AS n FROM users WHERE role NOT IN ('admin', 'readonly')").get() as { n: number };
    if (others.n > 0) {
      return { list: [], source: 'none', reason: 'FUNNEL_WEEKLY_TO is not set, and people who are not admins can edit scheduled reports, so their recipients are not used. Name the recipients in FUNNEL_WEEKLY_TO.' };
    }
    rows = db.prepare('SELECT recipients FROM scheduled_reports WHERE enabled = 1').all() as Array<{ recipients: string | null }>;
  } catch {
    return { list: [], source: 'none', reason: 'FUNNEL_WEEKLY_TO is not set and the scheduled reports could not be read.' };
  }
  const fallback = validUnique(rows.flatMap((r) => (typeof r.recipients === 'string' ? r.recipients.split(',') : [])));
  if (fallback.length === 0) return { list: [], source: 'none', reason: 'FUNNEL_WEEKLY_TO is not set and no enabled scheduled report has a recipient.' };
  if (fallback.length > FALLBACK_MAX) {
    return { list: [], source: 'none', reason: `FUNNEL_WEEKLY_TO is not set and the scheduled reports reach ${fallback.length} people, more than the ${FALLBACK_MAX} allowed without naming them.` };
  }
  return { list: fallback, source: 'scheduled_reports' };
}

/** The addresses only (see resolveWeeklyRecipients for where they came from). */
export function weeklyFunnelRecipients(): string[] {
  return resolveWeeklyRecipients().list;
}

/** The address of the LogNog site for the link in the email. */
export function weeklyFunnelBaseUrl(): string {
  const set = (process.env.PUBLIC_URL || process.env.LOGNOG_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  return set || 'https://logs.machinekinglabs.com';
}

function mailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER);
}

export interface WeeklySendResult {
  sent: boolean;
  /** How many people (never who). */
  recipients: number;
  reason?: string;
  title?: string;
  /** Where the recipient list came from. */
  source?: RecipientSource;
  /** True when this was only a check of who it would go to. */
  dryRun?: boolean;
}

/** Hand a built report to the mail server. Separate so the caller knows exactly when mail was attempted. */
export async function mailWeeklyFunnelReport(report: WeeklyFunnelReport, recipients: string[]): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  const base = weeklyFunnelBaseUrl();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@lognog.local',
    to: recipients.join(', '),
    subject: `Weekly funnel report: ${report.title}`,
    html: renderWeeklyFunnelEmail(report, `${base}/funnels/weekly`),
    attachments: weeklyFunnelLogoAttachments(report),
  });
}

/**
 * The admin "send now" route. It is a CHECK unless told otherwise: by default
 * it only says how many people the report would go to and where that list came
 * from; nothing is built and nothing is sent. It sends only with
 * `{ send: true }`, so a mistyped flag can never cause a real email.
 * A real send does not look at the day or at earlier sends.
 */
export async function sendWeeklyFunnelReport(opts: { send?: boolean } = {}): Promise<WeeklySendResult> {
  const resolved = resolveWeeklyRecipients();
  const mail = mailConfigured();
  if (opts.send !== true) {
    return {
      sent: false,
      dryRun: true,
      recipients: resolved.list.length,
      source: resolved.source,
      reason: !mail ? 'No mail server is set up (SMTP_HOST / SMTP_USER).' : resolved.reason,
    };
  }
  if (!mail) return { sent: false, recipients: 0, source: resolved.source, reason: 'No mail server is set up (SMTP_HOST / SMTP_USER).' };
  if (resolved.list.length === 0) return { sent: false, recipients: 0, source: 'none', reason: resolved.reason ?? 'Nobody to send it to.' };
  const report = await getWeeklyFunnelReport();
  try {
    await mailWeeklyFunnelReport(report, resolved.list);
  } catch (error) {
    // Never rethrow the mail error: its text can quote an address and the route would log it.
    console.error(`[Funnels] Weekly report by hand: the mail server reported a problem (${mailErrorCode(error)}).`);
    return { sent: false, recipients: resolved.list.length, source: resolved.source, reason: `The mail server reported a problem (${mailErrorCode(error)}).`, title: report.title };
  }
  console.log(`[Funnels] Weekly report sent by hand to ${resolved.list.length} (list from ${resolved.source}).`);
  return { sent: true, recipients: resolved.list.length, source: resolved.source, title: report.title };
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
    const resolved = resolveWeeklyRecipients();
    const recipients = resolved.list;
    if (recipients.length === 0) {
      if (saidNoRecipientsFor !== due.key) {
        saidNoRecipientsFor = due.key;
        console.log(`[Funnels] Weekly report not sent: ${resolved.reason ?? 'nobody to send it to.'}`);
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
      console.error(`[Funnels] Weekly report: the mail server reported a problem (${mailErrorCode(error)}); not retrying this week.`);
      return { sent: false, recipients: recipients.length, reason: 'mail server problem', title: report.title };
    }
    try {
      markWeek(due.key, 'sent', recipients.length);
    } catch {
      /* the 'mailing' mark already closes the week */
    }
    console.log(`[Funnels] Weekly report for ${due.key} sent to ${recipients.length} (list from ${resolved.source}).`);
    return { sent: true, recipients: recipients.length, title: report.title };
  } catch (error) {
    console.error(`[Funnels] Weekly report failed (${mailErrorCode(error)}).`);
    return { sent: false, recipients: 0, reason: 'error' };
  } finally {
    running = false;
  }
}
