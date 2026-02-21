import nodemailer from 'nodemailer';
import { getSQLiteDB, getAlerts, Alert, getScheduledSavedSearches, updateSavedSearchCache, updateSavedSearchError, cleanupExpiredSearchCache, SavedSearch, getSystemSetting, getProjectBySlug } from '../db/sqlite.js';
import { executeDSLQuery } from '../db/backend.js';
import { parseAndCompile } from '../dsl/index.js';
import { evaluateAlert } from './alerts.js';
import { logReportGenerated } from './internal-logger.js';
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

// Parse cron expression and check if it should run now
function shouldRunNow(schedule: string, lastRun: string | null): boolean {
  // Simple cron parser for common patterns
  // Format: minute hour day-of-month month day-of-week
  const parts = schedule.split(' ');
  if (parts.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const now = new Date();

  // Check if enough time has passed since last run
  if (lastRun) {
    const lastRunDate = new Date(lastRun);
    const minInterval = getMinimumInterval(schedule);
    if (now.getTime() - lastRunDate.getTime() < minInterval) {
      return false;
    }
  }

  // Check minute
  if (minute !== '*' && minute !== '*/1') {
    const nowMinute = now.getMinutes();
    if (minute.startsWith('*/')) {
      const interval = parseInt(minute.slice(2), 10);
      if (nowMinute % interval !== 0) return false;
    } else if (parseInt(minute, 10) !== nowMinute) {
      return false;
    }
  }

  // Check hour
  if (hour !== '*') {
    const nowHour = now.getHours();
    if (hour.startsWith('*/')) {
      const interval = parseInt(hour.slice(2), 10);
      if (nowHour % interval !== 0) return false;
    } else if (parseInt(hour, 10) !== nowHour) {
      return false;
    }
  }

  // Check day of month
  if (dayOfMonth !== '*') {
    if (parseInt(dayOfMonth, 10) !== now.getDate()) return false;
  }

  // Check month
  if (month !== '*') {
    if (parseInt(month, 10) !== now.getMonth() + 1) return false;
  }

  // Check day of week (0 = Sunday)
  if (dayOfWeek !== '*') {
    if (parseInt(dayOfWeek, 10) !== now.getDay()) return false;
  }

  return true;
}

function getMinimumInterval(schedule: string): number {
  const parts = schedule.split(' ');
  if (parts.length !== 5) return 60 * 60 * 1000; // Default 1 hour

  const [minute, hour] = parts;

  // Calculate minimum interval based on schedule
  if (minute.startsWith('*/')) {
    return parseInt(minute.slice(2), 10) * 60 * 1000;
  }
  if (hour.startsWith('*/')) {
    return parseInt(hour.slice(2), 10) * 60 * 60 * 1000;
  }
  if (hour !== '*') {
    return 24 * 60 * 60 * 1000; // Daily
  }
  return 60 * 60 * 1000; // Hourly
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
    // Calculate time range (last 7 days for weekly reports)
    const now = new Date();
    const earliest = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const latestIso = now.toISOString();
    const earliestIso = earliest.toISOString();

    // Execute DSL query using backend abstraction (handles ClickHouse vs SQLite)
    const { sql, results } = await executeDSLQuery(report.query, {
      earliest: '-7d',
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
    if (report.app_scope && report.app_scope !== 'default') {
      const project = getProjectBySlug(report.app_scope);
      if (project) {
        if (project.accent_color) accentColor = project.accent_color;
        if (project.logo_url) logoUrl = project.logo_url;
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

// Check for reports, alerts, and saved searches to run every minute
export function startScheduler(): void {
  console.log('Report and alert scheduler started');

  setInterval(async () => {
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

      // Check scheduled saved searches
      await checkScheduledSavedSearches();

      // Cleanup expired caches (run less frequently - every 5 minutes)
      const now = new Date();
      if (now.getMinutes() % 5 === 0) {
        await runCacheCleanup();
      }
    } catch (error) {
      console.error('Scheduler error:', error);
    }
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
