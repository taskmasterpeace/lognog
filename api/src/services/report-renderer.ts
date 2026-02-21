/**
 * Report Renderer Service
 *
 * Generates HTML, CSV, and JSON output for scheduled reports
 * with support for template tokens, summary cards, and conditional sections.
 */

import { processTemplate, ReportContext } from './template-engine.js';

// Configuration constants
const MAX_TABLE_ROWS = 500;
const MAX_SUMMARY_STATS = 2;
const DEFAULT_ACCENT_COLOR = '#5A3F24'; // LogNog chocolate brown

export interface ReportData {
  report: {
    id: string;
    name: string;
    description?: string;
    query: string;
    schedule?: string;
    app_scope?: string;
  };
  results: Record<string, unknown>[];
  executionTimeMs: number;
  earliest: string;
  latest: string;
  baseUrl?: string;
}

export interface RenderOptions {
  format: 'html' | 'csv' | 'json';
  attachmentFormat?: 'none' | 'html' | 'csv' | 'json';
  subjectTemplate?: string;
  messageTemplate?: string;
  accentColor?: string;
  logoUrl?: string;
}

/**
 * Build ReportContext from report data for template processing
 */
export function buildReportContext(data: ReportData): ReportContext {
  const columns = data.results.length > 0 ? Object.keys(data.results[0]) : [];
  const timeRangeMs = new Date(data.latest).getTime() - new Date(data.earliest).getTime();
  const timeRange = formatTimeRange(timeRangeMs);

  return {
    report_name: data.report.name,
    report_id: data.report.id,
    report_description: data.report.description,
    report_schedule: data.report.schedule ? describeCron(data.report.schedule) : undefined,
    run_time: new Date().toISOString(),
    execution_time_ms: data.executionTimeMs,
    time_range: timeRange,
    earliest: data.earliest,
    latest: data.latest,
    results: data.results,
    result: data.results[0],
    result_count: data.results.length,
    column_count: columns.length,
    columns,
    results_link: data.baseUrl ? `${data.baseUrl}/search?query=${encodeURIComponent(data.report.query)}` : undefined,
    app_name: data.report.app_scope || 'LogNog',
    app_scope: data.report.app_scope || 'default',
  };
}

/**
 * Render report email subject with token substitution
 */
export function renderSubject(subjectTemplate: string, context: ReportContext): string {
  const defaultTemplate = '[LogNog Report] {{report_name}}';
  return processTemplate(subjectTemplate || defaultTemplate, context);
}

/**
 * Render report HTML body with enhanced formatting
 */
export function renderHtml(data: ReportData, options: RenderOptions = { format: 'html' }): string {
  const context = buildReportContext(data);
  const accentColor = options.accentColor || DEFAULT_ACCENT_COLOR;
  const columns = context.columns;

  // If custom message template is provided, process it
  if (options.messageTemplate) {
    return processTemplate(options.messageTemplate, context);
  }

  // Default HTML template with summary card and table
  const generatedAt = new Date().toLocaleString();

  // Calculate summary stats
  const summaryStats = calculateSummaryStats(data.results);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.report.name)} - LogNog Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      line-height: 1.5;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header {
      background: linear-gradient(135deg, ${accentColor} 0%, ${adjustColor(accentColor, -20)} 100%);
      color: white;
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
    }
    .header h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
    .header p { opacity: 0.9; font-size: 0.875rem; }
    .header-description { margin-top: 0.5rem; opacity: 0.85; font-size: 0.875rem; }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 2rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(255,255,255,0.2);
    }
    .meta-item { font-size: 0.75rem; }
    .meta-label { opacity: 0.7; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .summary-card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .summary-card.highlight {
      background: linear-gradient(135deg, ${accentColor}10 0%, ${accentColor}05 100%);
      border: 1px solid ${accentColor}30;
    }
    .summary-value { font-size: 2rem; font-weight: 700; color: ${accentColor}; }
    .summary-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-subtext { font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem; }
    .query-box {
      background: #1e293b;
      color: #e2e8f0;
      padding: 1rem;
      border-radius: 8px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.875rem;
      margin-bottom: 2rem;
      overflow-x: auto;
    }
    .table-container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; }
    th {
      background: #f1f5f9;
      text-align: left;
      padding: 0.75rem 1rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      color: #475569;
      border-bottom: 2px solid #e2e8f0;
      position: sticky;
      top: 0;
    }
    td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.875rem;
    }
    tr:hover td { background: #f8fafc; }
    .severity-0, .severity-1, .severity-2, .severity-3 {
      color: #dc2626;
      font-weight: 500;
    }
    .severity-4 { color: #ea580c; }
    .severity-5, .severity-6 { color: #16a34a; }
    .severity-7 { color: #64748b; }
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: #64748b;
    }
    .empty-state h3 { color: #475569; margin-bottom: 0.5rem; }
    .footer {
      text-align: center;
      margin-top: 2rem;
      color: #94a3b8;
      font-size: 0.75rem;
    }
    .footer a { color: ${accentColor}; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
    .truncated-notice {
      text-align: center;
      margin-top: 1rem;
      padding: 0.75rem;
      background: #fef3c7;
      color: #92400e;
      border-radius: 8px;
      font-size: 0.875rem;
    }
    @media print {
      body { background: white; padding: 0; }
      .header { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${options.logoUrl ? `<img src="${escapeHtml(options.logoUrl)}" alt="Logo" style="height: 32px; margin-bottom: 1rem;" />` : ''}
      <h1>${escapeHtml(data.report.name)}</h1>
      <p>Scheduled Report from ${escapeHtml(context.app_name || 'LogNog')}</p>
      ${data.report.description ? `<p class="header-description">${escapeHtml(data.report.description)}</p>` : ''}
      <div class="meta">
        <div class="meta-item">
          <span class="meta-label">Generated:</span> ${escapeHtml(generatedAt)}
        </div>
        <div class="meta-item">
          <span class="meta-label">Time Range:</span> ${escapeHtml(context.time_range)}
        </div>
        <div class="meta-item">
          <span class="meta-label">Query Time:</span> ${context.execution_time_ms}ms
        </div>
      </div>
    </div>

    <div class="summary">
      <div class="summary-card highlight">
        <div class="summary-value">${data.results.length.toLocaleString()}</div>
        <div class="summary-label">Total Results</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${columns.length}</div>
        <div class="summary-label">Columns</div>
      </div>
      ${summaryStats.map(stat => `
      <div class="summary-card">
        <div class="summary-value">${escapeHtml(stat.value)}</div>
        <div class="summary-label">${escapeHtml(stat.label)}</div>
        ${stat.subtext ? `<div class="summary-subtext">${escapeHtml(stat.subtext)}</div>` : ''}
      </div>
      `).join('')}
    </div>

    <div class="query-box">${escapeHtml(data.report.query)}</div>

    ${data.results.length === 0 ? `
    <div class="empty-state">
      <h3>No Results</h3>
      <p>No data matched your query for this time period.</p>
    </div>
    ` : `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            ${columns.map(col => `<th>${escapeHtml(col)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.results.slice(0, MAX_TABLE_ROWS).map(row => `
            <tr>
              ${columns.map(col => {
                const value = row[col];
                const className = col === 'severity' ? `severity-${value}` : '';
                return `<td class="${className}">${escapeHtml(formatValue(value))}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${data.results.length > MAX_TABLE_ROWS ? `
    <div class="truncated-notice">
      Showing ${MAX_TABLE_ROWS.toLocaleString()} of ${data.results.length.toLocaleString()} results.
      <a href="${context.results_link || '#'}">View all in LogNog</a>
    </div>
    ` : ''}
    `}

    <div class="footer">
      ${context.results_link ? `<a href="${context.results_link}">View in LogNog</a> | ` : ''}
      ${escapeHtml(context.app_name || 'LogNog')} | ${escapeHtml(generatedAt)}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Render report as CSV
 */
export function renderCsv(data: ReportData): string {
  if (data.results.length === 0) {
    return '';
  }

  const columns = Object.keys(data.results[0]);
  const header = columns.map(escapeCsvField).join(',');
  const rows = data.results.map(row =>
    columns.map(col => escapeCsvField(formatValue(row[col]))).join(',')
  );

  return [header, ...rows].join('\n');
}

/**
 * Render report as JSON
 */
export function renderJson(data: ReportData): string {
  const context = buildReportContext(data);

  return JSON.stringify({
    report: {
      id: context.report_id,
      name: context.report_name,
      description: context.report_description,
      query: data.report.query,
    },
    execution: {
      run_time: context.run_time,
      execution_time_ms: context.execution_time_ms,
      time_range: context.time_range,
      earliest: context.earliest,
      latest: context.latest,
    },
    results: {
      count: context.result_count,
      columns: context.columns,
      data: data.results,
    },
  }, null, 2);
}

/**
 * Generate report attachment based on format
 */
export function generateAttachment(
  data: ReportData,
  format: 'none' | 'html' | 'csv' | 'json'
): { content: string; filename: string; contentType: string } | null {
  if (format === 'none') {
    return null;
  }

  const safeName = data.report.name.replace(/[^a-z0-9]/gi, '_');
  const timestamp = Date.now();

  switch (format) {
    case 'html':
      return {
        content: renderHtml(data),
        filename: `${safeName}_${timestamp}.html`,
        contentType: 'text/html',
      };
    case 'csv':
      return {
        content: renderCsv(data),
        filename: `${safeName}_${timestamp}.csv`,
        contentType: 'text/csv',
      };
    case 'json':
      return {
        content: renderJson(data),
        filename: `${safeName}_${timestamp}.json`,
        contentType: 'application/json',
      };
    default:
      return null;
  }
}

// Helper functions

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeCsvField(value: string): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatTimeRange(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  const days = hours / 24;

  if (days >= 1) {
    return days === 1 ? 'Last 24 hours' : `Last ${Math.round(days)} days`;
  }
  if (hours >= 1) {
    return hours === 1 ? 'Last hour' : `Last ${Math.round(hours)} hours`;
  }
  const minutes = ms / (1000 * 60);
  return minutes === 1 ? 'Last minute' : `Last ${Math.round(minutes)} minutes`;
}

function describeCron(cron: string): string {
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  // Daily at specific time
  if (dayOfMonth === '*' && dayOfWeek === '*' && hour !== '*' && minute !== '*') {
    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    const time = `${h}:${m.toString().padStart(2, '0')}`;
    return `Daily at ${time}`;
  }

  // Weekly
  if (dayOfMonth === '*' && dayOfWeek !== '*') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `Weekly on ${days[parseInt(dayOfWeek, 10)] || dayOfWeek}`;
  }

  // Every X minutes
  if (minute.startsWith('*/')) {
    return `Every ${minute.slice(2)} minutes`;
  }

  // Every X hours
  if (hour.startsWith('*/')) {
    return `Every ${hour.slice(2)} hours`;
  }

  return cron;
}

/**
 * Adjust a hex color by a given amount.
 * Positive amounts lighten, negative amounts darken.
 */
function adjustColor(hex: string, amount: number): string {
  // Validate hex color format
  const cleanHex = hex.replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
    return hex; // Return original if invalid
  }

  const num = parseInt(cleanHex, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Columns that typically contain counts/totals worth summarizing */
const SUMMARY_COLUMNS = ['count', 'total', 'sum'];

/**
 * Calculate summary statistics from query results.
 * Automatically detects count/total columns and provides meaningful summaries.
 */
function calculateSummaryStats(
  results: Record<string, unknown>[]
): Array<{ label: string; value: string; subtext?: string }> {
  if (results.length === 0) return [];

  const stats: Array<{ label: string; value: string; subtext?: string }> = [];
  const columns = Object.keys(results[0]);

  // Find and aggregate count/total columns
  for (const col of columns) {
    const isCountColumn = SUMMARY_COLUMNS.some(
      prefix => col === prefix || col.endsWith(`_${prefix}`)
    );

    if (isCountColumn) {
      const total = results.reduce((sum, row) => {
        const val = Number(row[col]);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);

      stats.push({
        label: formatColumnLabel(col),
        value: total.toLocaleString(),
      });

      if (stats.length >= MAX_SUMMARY_STATS) break;
    }
  }

  // Fallback: show top value from first grouped column
  if (stats.length === 0 && results.length > 0) {
    const groupCol = columns.find(c =>
      !SUMMARY_COLUMNS.includes(c) && c !== 'time_bucket' && !c.startsWith('_')
    );

    if (groupCol && results[0][groupCol] !== undefined) {
      stats.push({
        label: `Top ${formatColumnLabel(groupCol)}`,
        value: String(results[0][groupCol]),
        subtext: `${results.length} unique values`,
      });
    }
  }

  return stats.slice(0, MAX_SUMMARY_STATS);
}

/**
 * Format a column name as a human-readable label.
 * Converts snake_case to Title Case.
 */
function formatColumnLabel(col: string): string {
  return col
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
