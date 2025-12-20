import nodemailer from 'nodemailer';
import { getSQLiteDB, getAlerts, Alert } from '../db/sqlite.js';
import { executeQuery } from '../db/clickhouse.js';
import { parseAndCompile } from '../dsl/index.js';
import { evaluateAlert } from './alerts.js';

interface ScheduledReport {
  id: string;
  name: string;
  query: string;
  schedule: string;
  recipients: string;
  format: string;
  enabled: number;
  last_run: string | null;
  created_at: string;
}

// SMTP Configuration
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
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
      const interval = parseInt(minute.slice(2));
      if (nowMinute % interval !== 0) return false;
    } else if (parseInt(minute) !== nowMinute) {
      return false;
    }
  }

  // Check hour
  if (hour !== '*') {
    const nowHour = now.getHours();
    if (hour.startsWith('*/')) {
      const interval = parseInt(hour.slice(2));
      if (nowHour % interval !== 0) return false;
    } else if (parseInt(hour) !== nowHour) {
      return false;
    }
  }

  // Check day of month
  if (dayOfMonth !== '*') {
    if (parseInt(dayOfMonth) !== now.getDate()) return false;
  }

  // Check month
  if (month !== '*') {
    if (parseInt(month) !== now.getMonth() + 1) return false;
  }

  // Check day of week (0 = Sunday)
  if (dayOfWeek !== '*') {
    if (parseInt(dayOfWeek) !== now.getDay()) return false;
  }

  return true;
}

function getMinimumInterval(schedule: string): number {
  const parts = schedule.split(' ');
  if (parts.length !== 5) return 60 * 60 * 1000; // Default 1 hour

  const [minute, hour] = parts;

  // Calculate minimum interval based on schedule
  if (minute.startsWith('*/')) {
    return parseInt(minute.slice(2)) * 60 * 1000;
  }
  if (hour.startsWith('*/')) {
    return parseInt(hour.slice(2)) * 60 * 60 * 1000;
  }
  if (hour !== '*') {
    return 24 * 60 * 60 * 1000; // Daily
  }
  return 60 * 60 * 1000; // Hourly
}

async function generateReportHtml(
  title: string,
  query: string,
  results: Record<string, unknown>[]
): Promise<string> {
  const columns = results.length > 0 ? Object.keys(results[0]) : [];
  const generatedAt = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} - LogNog Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #f8fafc; }
    .header { background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .header h1 { margin: 0 0 5px 0; font-size: 24px; }
    .header p { margin: 0; opacity: 0.9; font-size: 14px; }
    .meta { margin-top: 10px; font-size: 12px; opacity: 0.8; }
    .query { background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; margin-bottom: 20px; overflow-x: auto; }
    .stats { display: flex; gap: 15px; margin-bottom: 20px; }
    .stat { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .stat-value { font-size: 24px; font-weight: bold; color: #0ea5e9; }
    .stat-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { background: #f1f5f9; padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #475569; border-bottom: 2px solid #e2e8f0; }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
    tr:hover td { background: #f8fafc; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <p>Scheduled Report from LogNog Log Analytics</p>
    <div class="meta">Generated: ${escapeHtml(generatedAt)}</div>
  </div>
  <div class="query">${escapeHtml(query)}</div>
  <div class="stats">
    <div class="stat">
      <div class="stat-value">${results.length.toLocaleString()}</div>
      <div class="stat-label">Results</div>
    </div>
    <div class="stat">
      <div class="stat-value">${columns.length}</div>
      <div class="stat-label">Columns</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${results.slice(0, 500).map(row => `
        <tr>${columns.map(c => `<td>${escapeHtml(String(row[c] ?? ''))}</td>`).join('')}</tr>
      `).join('')}
    </tbody>
  </table>
  ${results.length > 500 ? `<p style="text-align:center;color:#64748b;margin-top:15px;">Showing 500 of ${results.length} results</p>` : ''}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function runReport(report: ScheduledReport): Promise<void> {
  console.log(`Running scheduled report: ${report.name}`);

  try {
    // Compile and execute query
    const compiled = parseAndCompile(report.query);
    let sql = compiled.sql;

    // Add time range for last 24 hours
    const timeCondition = `timestamp >= now() - INTERVAL 24 HOUR`;
    if (sql.includes('WHERE')) {
      sql = sql.replace('WHERE', `WHERE ${timeCondition} AND`);
    } else if (sql.includes('FROM lognog.logs')) {
      sql = sql.replace('FROM lognog.logs', `FROM lognog.logs WHERE ${timeCondition}`);
    }

    const results = await executeQuery(sql);

    // Generate HTML report
    const html = await generateReportHtml(report.name, report.query, results);

    // Send email
    if (transporter) {
      const recipients = report.recipients.split(',').map(e => e.trim());

      await transporter.sendMail({
        from: SMTP_FROM,
        to: recipients.join(', '),
        subject: `[LogNog Report] ${report.name}`,
        html,
        attachments: [
          {
            filename: `${report.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.html`,
            content: html,
            contentType: 'text/html',
          },
        ],
      });

      console.log(`Report "${report.name}" sent to ${recipients.join(', ')}`);
    } else {
      console.log(`Report "${report.name}" generated but SMTP not configured`);
    }

    // Update last_run
    const db = getSQLiteDB();
    db.prepare("UPDATE scheduled_reports SET last_run = datetime('now') WHERE id = ?").run(report.id);
  } catch (error) {
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

// Check for reports and alerts to run every minute
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
