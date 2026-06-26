import nodemailer from 'nodemailer';
import * as cron from 'node-cron';
import { getSQLiteDB, getAlerts, Alert, getScheduledSavedSearches, updateSavedSearchCache, updateSavedSearchError, cleanupExpiredSearchCache, SavedSearch, getSystemSetting, getProjectBySlug } from '../db/sqlite.js';
import { executeDSLQuery } from '../db/backend.js';
import { parseAndCompile } from '../dsl/index.js';
import { evaluateAlert } from './alerts.js';
import { logReportGenerated } from './internal-logger.js';
import { getStaleSources, markStaleNotified, markSourceUnexpected } from './heartbeat.js';
import { getPullCollectors, runPullCollector } from './pull-collector.js';
import { insertLogs } from '../db/backend.js';
import {
  renderHtml,
  renderSubject,
  buildReportContext,
  generateAttachment,
  ReportData,
  RenderOptions,
} from './report-renderer.js';

interface ScheduledReport {
  id: string;
  name: string;
  description?: string;
  query: string;
  schedule: string;
  recipients: string;
  format: string;
  attachment_format?: string;
  subject_template?: string;
  message_template?: string;
  send_condition?: string;
  condition_threshold?: number;
  compare_offset?: string;
  enabled: number;
  last_run: string | null;
  last_result_count?: number;
  app_scope?: string;
  created_at: string;
}

// SMTP Configuration
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
};

const SMTP_FROM = process.env.SMTP_FROM || 'noreply@lognog.local';

// Create transporter if SMTP is configured
let transporter: nodemailer.Transporter | null = null;

if (SMTP_CONFIG.host) {
  transporter = nodemailer.createTransport(SMTP_CONFIG);
  console.log(`SMTP configured: ${SMTP_CONFIG.host}:${SMTP_CONFIG.port}`);
} else {
  console.log('SMTP not configured - scheduled report emails will be skipped');
}

/**
 * Cron matching (issue #39).
 *
 * The previous hand-rolled matcher fired only when `now.getMinutes()` exactly
 * equalled the cron minute, used `nowMinute % interval` (wrong whenever the
 * interval does not divide 60, e.g. `*​/7`), and never parsed comma-lists such
 * as `15,45 * * * *`. A 60s setInterval drifts, so the exact-minute check could
 * skip the target minute entirely and a daily report/alert would silently never
 * run.
 *
 * We now delegate validation to node-cron (the same library the synthetic
 * scheduler uses) and parse each field into the explicit set of values it
 * permits, then compute the next fire time at or after a base instant. A job is
 * "due" on a given tick when its next fire time strictly after its last run has
 * already arrived (<= now). This is robust to interval drift: a missed minute is
 * still caught on the following tick because we compare against last_run rather
 * than requiring exact minute equality.
 *
 * Supported per field: `*`, `a`, `a-b`, `a-b/N`, `*​/N`, and comma-lists of any
 * of those (e.g. `0-5,15,30-45/5`). Standard 5-field cron:
 *   minute(0-59) hour(0-23) day-of-month(1-31) month(1-12) day-of-week(0-6)
 */

interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
}

const FIELD_RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6],  // day of week
];

// Expand a single cron field (e.g. "*/7", "15,45", "0-5", "*") into the set of
// matching integers within [min, max].
function expandField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    let step = 1;
    let rangePart = part;

    const slashIdx = part.indexOf('/');
    if (slashIdx !== -1) {
      step = parseInt(part.slice(slashIdx + 1), 10);
      rangePart = part.slice(0, slashIdx);
      if (!Number.isFinite(step) || step <= 0) continue;
    }

    let start = min;
    let end = max;
    if (rangePart === '*') {
      // full range, honoring step
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-');
      start = parseInt(a, 10);
      end = parseInt(b, 10);
    } else {
      start = parseInt(rangePart, 10);
      end = slashIdx !== -1 ? max : start; // "5/10" means 5,15,25,... up to max
    }

    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    start = Math.max(min, start);
    end = Math.min(max, end);

    for (let v = start; v <= end; v += step) {
      values.add(v);
    }
  }

  return values;
}

// Parse a validated 5-field cron expression into matching value sets.
function parseCron(schedule: string): CronFields | null {
  if (!cron.validate(schedule)) return null;

  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const sets = parts.map((p, i) => expandField(p, FIELD_RANGES[i][0], FIELD_RANGES[i][1]));
  // day-of-week 7 is sometimes used for Sunday; node-cron normalizes, but guard anyway.
  if (sets[4].has(7)) sets[4].add(0);

  return {
    minutes: sets[0],
    hours: sets[1],
    daysOfMonth: sets[2],
    months: sets[3],
    daysOfWeek: sets[4],
  };
}

function matchesDate(fields: CronFields, date: Date): boolean {
  return (
    fields.minutes.has(date.getMinutes()) &&
    fields.hours.has(date.getHours()) &&
    fields.daysOfMonth.has(date.getDate()) &&
    fields.months.has(date.getMonth() + 1) &&
    fields.daysOfWeek.has(date.getDay())
  );
}

/**
 * Compute the next fire time strictly after `after`, minute-aligned.
 * Walks forward minute-by-minute (bounded) until all fields match.
 * Returns null if no match within the search horizon.
 */
function nextFireAfter(fields: CronFields, after: Date): Date | null {
  const cursor = new Date(after.getTime());
  // Move to the start of the next minute (strictly after `after`).
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  // Search up to ~366 days of minutes to cover any annual schedule.
  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    if (matchesDate(fields, cursor)) return new Date(cursor.getTime());
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}

/**
 * Decide whether a cron job is due on this tick.
 *
 * - With a `lastRun`: due when the next fire strictly after lastRun is <= now.
 *   This catches missed minutes from interval drift.
 * - Without a `lastRun` (never run): due when the current minute matches, so a
 *   freshly-created job fires the first time its cron lines up rather than
 *   waiting a full cycle.
 *
 * Exported for unit testing.
 */
export function shouldRunNow(schedule: string, lastRun: string | null, now: Date = new Date()): boolean {
  const fields = parseCron(schedule);
  if (!fields) return false;

  if (!lastRun) {
    return matchesDate(fields, now);
  }

  const lastRunDate = new Date(lastRun);
  if (isNaN(lastRunDate.getTime())) {
    // Corrupt last_run — fall back to current-minute match.
    return matchesDate(fields, now);
  }

  const next = nextFireAfter(fields, lastRunDate);
  if (!next) return false;
  return next.getTime() <= now.getTime();
}

/**
 * Map a report's cron schedule to the query time window it should cover.
 *
 * Previously `runReport` hard-coded `-7d` regardless of cadence, so a daily or
 * hourly report queried 7 days of data and its if_change/threshold/if_results
 * conditions compared 7-day counts. We derive the window from the schedule's
 * effective frequency: roughly the gap between consecutive fires.
 *
 * Returns a relative time-range string understood by the DSL backend
 * (e.g. "-1h", "-24h", "-7d"). Exported for unit testing.
 */
export function reportWindowForSchedule(schedule: string): string {
  const fields = parseCron(schedule);
  if (!fields) return '-24h'; // sensible default

  const everyMinute = fields.minutes.size >= 60;
  const everyHour = fields.hours.size >= 24;
  const everyDom = fields.daysOfMonth.size >= 31;
  const everyDow = fields.daysOfWeek.size >= 7;

  // Sub-hourly: minute field is restricted but it runs every hour & every day.
  if (!everyMinute && everyHour && everyDom && everyDow) {
    // e.g. "*/5 * * * *" or "0 * * * *" -> last hour
    return '-1h';
  }

  // Hourly cadence: a specific minute each hour (handled above). If the hour
  // field is restricted but it still runs every day, treat as daily.
  if (!everyHour && everyDom && everyDow) {
    // Runs on specific hour(s) each day -> daily window
    return '-24h';
  }

  // Weekly cadence: restricted to specific day(s) of week.
  if (!everyDow) {
    return '-7d';
  }

  // Monthly cadence: restricted to specific day(s) of month.
  if (!everyDom) {
    return '-30d';
  }

  // Fallback: weekly window preserves historical behavior.
  return '-7d';
}

// Map a relative window string to milliseconds (for computing display ranges).
function windowToMs(window: string): number {
  const match = window.match(/^-?(\d+)(s|m|h|d)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Check if report should be sent based on send_condition
 */
function shouldSendReport(
  report: ScheduledReport,
  results: Record<string, unknown>[],
  previousCount: number | null
): boolean {
  const condition = report.send_condition || 'always';

  switch (condition) {
    case 'always':
      return true;

    case 'if_results':
      return results.length > 0;

    case 'if_change':
      // Send only if result count changed from last run
      if (previousCount === null) return true; // First run
      return results.length !== previousCount;

    case 'threshold':
      // Send if result count exceeds threshold
      const threshold = report.condition_threshold || 0;
      return results.length > threshold;

    default:
      return true;
  }
}

async function runReport(report: ScheduledReport): Promise<void> {
  console.log(`Running scheduled report: ${report.name}`);
  const startTime = performance.now();

  try {
    // Derive the query window from the report's schedule (issue #39 bug 5):
    // hourly -> -1h, daily -> -24h, weekly -> -7d, etc. Previously hard-coded
    // to -7d regardless of cadence, which skewed if_change/threshold/if_results
    // comparisons for daily/hourly reports.
    const window = reportWindowForSchedule(report.schedule);
    const now = new Date();
    const earliest = new Date(now.getTime() - windowToMs(window));
    const latestIso = now.toISOString();
    const earliestIso = earliest.toISOString();

    // Execute DSL query using backend abstraction (handles ClickHouse vs SQLite)
    const { sql, results } = await executeDSLQuery(report.query, {
      earliest: window,
      latest: 'now',
    });
    const executionTimeMs = Math.round(performance.now() - startTime);

    // Check send condition (Phase 5: Smart Reports)
    const previousCount = report.last_result_count ?? null;
    if (!shouldSendReport(report, results, previousCount)) {
      console.log(`Report "${report.name}" skipped - condition not met (${report.send_condition})`);
      // Still update last_run and last_result_count
      const db = getSQLiteDB();
      db.prepare("UPDATE scheduled_reports SET last_run = datetime('now'), last_result_count = ? WHERE id = ?")
        .run(results.length, report.id);
      return;
    }

    // Get branding from project first, then fall back to system settings
    let accentColor = getSystemSetting('branding_accent_color') || '#5A3F24'; // LogNog chocolate
    let logoUrl = getSystemSetting('branding_logo_url') || undefined;

    // If report has an app_scope (project), use project's branding
    let appName: string | undefined;
    if (report.app_scope && report.app_scope !== 'default') {
      const project = getProjectBySlug(report.app_scope);
      if (project) {
        if (project.accent_color) accentColor = project.accent_color;
        if (project.logo_url) logoUrl = project.logo_url;
        appName = project.name;
      }
    }

    // Build report data for renderer
    const reportData: ReportData = {
      report: {
        id: report.id,
        name: report.name,
        description: report.description,
        query: report.query,
        schedule: report.schedule,
        app_scope: report.app_scope,
        app_name: appName,
      },
      results,
      executionTimeMs,
      earliest: earliestIso,
      latest: latestIso,
      baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    };

    // Build context and render
    const context = buildReportContext(reportData);
    const renderOptions: RenderOptions = {
      format: (report.format as 'html' | 'csv' | 'json') || 'html',
      attachmentFormat: (report.attachment_format as 'none' | 'html' | 'csv' | 'json') || 'none',
      subjectTemplate: report.subject_template,
      messageTemplate: report.message_template,
      accentColor,
      logoUrl,
    };

    // Render subject with token substitution
    const subject = renderSubject(report.subject_template || '[LogNog Report] {{report_name}}', context);

    // Render HTML body
    const html = renderHtml(reportData, renderOptions);

    // Generate attachment if requested
    const attachment = generateAttachment(reportData, renderOptions.attachmentFormat || 'none');

    // Send email
    if (transporter) {
      const recipients = report.recipients.split(',').map(e => e.trim());

      const mailOptions: nodemailer.SendMailOptions = {
        from: SMTP_FROM,
        to: recipients.join(', '),
        subject,
        html,
      };

      // Add attachment if generated
      if (attachment) {
        mailOptions.attachments = [
          {
            filename: attachment.filename,
            content: attachment.content,
            contentType: attachment.contentType,
          },
        ];
      }

      await transporter.sendMail(mailOptions);

      const duration_ms = Math.round(performance.now() - startTime);
      logReportGenerated({
        report_id: report.id,
        report_name: report.name,
        duration_ms,
        row_count: results.length,
        sent_to: recipients,
      });

      console.log(`Report "${report.name}" sent to ${recipients.join(', ')}`);
    } else {
      const duration_ms = Math.round(performance.now() - startTime);
      logReportGenerated({
        report_id: report.id,
        report_name: report.name,
        duration_ms,
        row_count: results.length,
      });

      console.log(`Report "${report.name}" generated but SMTP not configured`);
    }

    // Update last_run and last_result_count
    const db = getSQLiteDB();
    db.prepare("UPDATE scheduled_reports SET last_run = datetime('now'), last_result_count = ? WHERE id = ?")
      .run(results.length, report.id);
  } catch (error) {
    const duration_ms = Math.round(performance.now() - startTime);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logReportGenerated({
      report_id: report.id,
      report_name: report.name,
      duration_ms,
      row_count: 0,
      error: errorMessage,
    });

    console.error(`Error running report "${report.name}":`, error);
  }
}

// Check alerts that need to run
async function checkAlerts(): Promise<void> {
  try {
    const alerts = getAlerts(true); // Get enabled alerts only

    for (const alert of alerts) {
      // Only check scheduled alerts (realtime alerts are handled differently)
      if (alert.schedule_type !== 'cron') continue;

      if (shouldRunNow(alert.cron_expression || '*/5 * * * *', alert.last_run || null)) {
        console.log(`Running scheduled alert: ${alert.name}`);
        await evaluateAlert(alert.id);
      }
    }
  } catch (error) {
    console.error('Error checking alerts:', error);
  }
}

// Parse time range to milliseconds
function parseTimeRange(timeRange: string): number {
  const match = timeRange.match(/^-?(\d+)(s|m|h|d)$/);
  if (!match) return 24 * 60 * 60 * 1000; // Default 24h

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

// Check scheduled saved searches and precompute results
async function checkScheduledSavedSearches(): Promise<void> {
  try {
    const searches = getScheduledSavedSearches();

    for (const search of searches) {
      if (!search.schedule) continue;

      if (shouldRunNow(search.schedule, search.last_run || null)) {
        console.log(`Running scheduled saved search: ${search.name}`);

        try {
          // Calculate time range
          const timeRangeMs = parseTimeRange(search.time_range);
          const earliest = new Date(Date.now() - timeRangeMs).toISOString();
          const latest = new Date().toISOString();

          // Execute the query
          const startTime = performance.now();
          const { sql, results } = await executeDSLQuery(search.query, { earliest, latest });
          const executionTimeMs = Math.round(performance.now() - startTime);

          // Update cache
          updateSavedSearchCache(search.id, results, sql, executionTimeMs);

          console.log(`Saved search "${search.name}" completed: ${results.length} results in ${executionTimeMs}ms`);
        } catch (error) {
          console.error(`Error running saved search "${search.name}":`, error);
          updateSavedSearchError(search.id, String(error));
        }
      }
    }
  } catch (error) {
    console.error('Error checking scheduled saved searches:', error);
  }
}

// Phase 3: Heartbeat / no-data sweep.
// A source is considered stale once it has not been seen for this many minutes.
const HEARTBEAT_STALE_MINUTES = 15;

/**
 * Sweep the tiny source_heartbeats table for sources that have gone silent.
 * Cost is O(sources) — never scans log data.
 *
 * To avoid duplicate alerts every tick, we only warn when a source FIRST
 * becomes stale (stale_notified = 0), then mark it notified. recordHeartbeats
 * resets stale_notified to 0 when the source is seen again.
 *
 * Internal-logging convention: the internal-logger functions are gated behind
 * the (default-off) self-monitoring settings, so for an operational warning we
 * use console.warn with a clear "[Heartbeat] source X silent since Y" message
 * AND emit a single synthetic warning log to index 'main' so it is searchable
 * regardless of self-monitoring settings.
 */
async function checkHeartbeats(): Promise<void> {
  try {
    const stale = getStaleSources(HEARTBEAT_STALE_MINUTES);
    for (const source of stale) {
      if (source.stale_notified) continue; // already warned about this silence

      const msg = `[Heartbeat] source ${source.source_key} silent since ${source.last_seen_at}`;
      console.warn(msg);

      // Emit a searchable synthetic warning log (severity 4 = WARNING).
      try {
        const ts = new Date().toISOString().replace('T', ' ').replace('Z', '');
        await insertLogs([
          {
            timestamp: ts,
            received_at: ts,
            severity: 4, // WARNING
            facility: 1,
            priority: (1 * 8) + 4,
            hostname: 'lognog-api',
            app_name: 'lognog-internal',
            app_scope: 'lognog',
            index_name: 'main',
            message: `Source ${source.source_key} has gone silent (last seen ${source.last_seen_at}, threshold ${HEARTBEAT_STALE_MINUTES}m)`,
            structured_data: JSON.stringify({
              action: 'heartbeat.stale',
              category: 'system',
              source_key: source.source_key,
              source_index: source.index_name,
              source_hostname: source.hostname,
              last_seen_at: source.last_seen_at,
              threshold_minutes: HEARTBEAT_STALE_MINUTES,
            }),
          },
        ]);
      } catch (logErr) {
        console.warn('[Heartbeat] failed to emit synthetic stale log:', logErr);
      }

      // The synthetic insert above re-enters insertLogs -> recordHeartbeats,
      // which would register LogNog's own internal source (main::lognog-api)
      // as a monitored/expected source. Mark it unexpected so it never
      // self-alerts as a stale no-data source.
      try {
        markSourceUnexpected('main', 'lognog-api');
      } catch (markErr) {
        console.warn('[Heartbeat] failed to mark internal source unexpected:', markErr);
      }

      // Mark so we don't warn again until the source returns.
      markStaleNotified(source.source_key);
    }
  } catch (error) {
    console.error('[Heartbeat] checkHeartbeats error:', error);
  }
}

// Phase 4 (Reach): check scheduled pull collectors.
// Each enabled collector fetches its HTTP endpoint on its own cron cadence and
// ingests the response as logs. runPullCollector never throws (it records
// errors on the collector row), but we still guard each call defensively.
async function checkPullCollectors(): Promise<void> {
  try {
    const collectors = getPullCollectors(true); // enabled only

    for (const collector of collectors) {
      if (shouldRunNow(collector.cron_expression || '*/15 * * * *', collector.last_run || null)) {
        console.log(`Running pull collector: ${collector.name}`);
        try {
          const result = await runPullCollector(collector.id);
          if (!result.ok) {
            console.error(`Pull collector "${collector.name}" failed: ${result.error}`);
          }
        } catch (error) {
          console.error(`Error running pull collector "${collector.name}":`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error checking pull collectors:', error);
  }
}

// Cleanup expired caches
async function runCacheCleanup(): Promise<void> {
  try {
    const cleaned = cleanupExpiredSearchCache();
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} expired saved search caches`);
    }
  } catch (error) {
    console.error('Error cleaning up expired caches:', error);
  }
}

// Re-entrancy guard (issue #39 bug 3): setInterval does not await the async
// tick, so a slow tick lets the next one start and re-read the same enabled
// rows whose last_run has not yet updated -> duplicate report/alert sends. We
// skip a tick entirely while the previous one is still running.
let tickRunning = false;

// Single scheduler tick: evaluate reports, alerts, heartbeats, saved searches,
// pull collectors, and periodic cache cleanup. Exported (indirectly) only via
// startScheduler; kept as a named function so the guard is easy to reason about.
async function runSchedulerTick(): Promise<void> {
  if (tickRunning) {
    console.warn('[Scheduler] Previous tick still running - skipping this tick');
    return;
  }
  tickRunning = true;
  try {
    // Check reports
    const db = getSQLiteDB();
    const reports = db.prepare(
      'SELECT * FROM scheduled_reports WHERE enabled = 1'
    ).all() as ScheduledReport[];

    for (const report of reports) {
      if (shouldRunNow(report.schedule, report.last_run)) {
        await runReport(report);
      }
    }

    // Check alerts
    await checkAlerts();

    // Phase 3: Heartbeat / no-data sweep (cheap, reads tiny presence table)
    try {
      await checkHeartbeats();
    } catch (hbError) {
      console.error('Heartbeat sweep error:', hbError);
    }

    // Check scheduled saved searches
    await checkScheduledSavedSearches();

    // Phase 4 (Reach): pull collectors (fetch external HTTP endpoints -> logs)
    try {
      await checkPullCollectors();
    } catch (pcError) {
      console.error('Pull collector sweep error:', pcError);
    }

    // Cleanup expired caches (run less frequently - every 5 minutes)
    const now = new Date();
    if (now.getMinutes() % 5 === 0) {
      await runCacheCleanup();
    }
  } catch (error) {
    console.error('Scheduler error:', error);
  } finally {
    tickRunning = false;
  }
}

// Check for reports, alerts, and saved searches to run every minute
export function startScheduler(): void {
  console.log('Report and alert scheduler started');

  setInterval(() => {
    // Fire-and-forget; the re-entrancy guard inside prevents overlap.
    void runSchedulerTick();
  }, 60 * 1000); // Check every minute
}

// Manual trigger for testing
export async function triggerReport(reportId: string): Promise<void> {
  const db = getSQLiteDB();
  const report = db.prepare('SELECT * FROM scheduled_reports WHERE id = ?').get(reportId) as ScheduledReport | undefined;

  if (!report) {
    throw new Error('Report not found');
  }

  await runReport(report);
}
