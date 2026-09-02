/**
 * Alert Service - Splunk-style alert evaluation and execution
 *
 * Evaluates alert conditions, triggers actions, and manages alert state.
 */

import nodemailer from 'nodemailer';
import {
  Alert,
  AlertAction,
  AlertSeverity,
  AlertTriggerType,
  getAlerts,
  getAlert,
  updateAlert,
  claimAlertTrigger,
  createAlertHistoryEntry,
  createAgentNotification,
  createLoginNotification,
  isAlertSilenced,
  resolveNotificationChannel,
  claimAlertTriggerKey,
  recordAlertFired,
} from '../db/sqlite.js';
import { executeDSLQuery, getBackend, filterRowsByDslCondition } from '../db/backend.js';
import { processTemplate, generateAISummary, TemplateContext } from './template-engine.js';
import { logAlertEvaluated, logAlertAction } from './internal-logger.js';

// Parse time range string like "-5m", "-1h", "-24h" to milliseconds
function parseTimeRange(timeRange: string): number {
  const match = timeRange.match(/^-?(\d+)(s|m|h|d)$/);
  if (!match) return 5 * 60 * 1000; // Default 5 minutes

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 5 * 60 * 1000;
  }
}

// Substitute template variables in text (Splunk-style)
// Supports: {{field}}, {{result.field}}, {{result[0].field}}
/**
 * Escape shell metacharacters to prevent command injection
 * This is critical for security when substituting user-controlled values into shell commands
 */
export function escapeShellArg(arg: string): string {
  // Remove dangerous shell metacharacters. Line breaks are included: with
  // `shell: true` a "\n" in a log message becomes a second command.
  return arg.replace(/[;&|`$(){}[\]\\!#*?<>~'"\r\n]/g, '');
}

function substituteVariables(
  text: string,
  results: Record<string, unknown>[],
  alertMetadata: {
    alert_name: string;
    alert_severity: string;
    result_count: number;
    timestamp: string;
  },
  sanitizeForShell: boolean = false
): string {
  if (!text) return text;

  // Get first result for default variable access
  const firstResult = results.length > 0 ? results[0] : {};

  // Helper to optionally sanitize values for shell commands
  const sanitize = (value: string): string => {
    return sanitizeForShell ? escapeShellArg(value) : value;
  };

  // Replace {{variable}} patterns
  return text.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const trimmedPath = path.trim();

    // Handle alert metadata variables (sanitize user-configurable ones)
    if (trimmedPath === 'alert_name') return sanitize(alertMetadata.alert_name);
    if (trimmedPath === 'alert_severity') return alertMetadata.alert_severity; // enum, safe
    if (trimmedPath === 'result_count') return String(alertMetadata.result_count); // number, safe
    if (trimmedPath === 'timestamp') return alertMetadata.timestamp; // ISO format, safe

    // Handle result.field pattern - ALWAYS sanitize as this is user-controlled log data
    if (trimmedPath.startsWith('result.')) {
      const field = trimmedPath.substring(7);
      const value = getNestedValue(firstResult, field);
      return value !== undefined ? sanitize(String(value)) : match;
    }

    // Handle result[0].field pattern - sanitize as this is user-controlled log data
    if (trimmedPath.startsWith('result[')) {
      const indexMatch = trimmedPath.match(/^result\[(\d+)\]\.(.+)$/);
      if (indexMatch) {
        const index = parseInt(indexMatch[1], 10);
        const field = indexMatch[2];
        if (index < results.length) {
          const value = getNestedValue(results[index], field);
          return value !== undefined ? sanitize(String(value)) : match;
        }
      }
      return match;
    }

    // Direct field access from first result - sanitize as this is user-controlled log data
    const value = getNestedValue(firstResult, trimmedPath);
    return value !== undefined ? sanitize(String(value)) : match;
  });
}

// Get nested value from object using dot notation
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: any = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }

  return current;
}

// Check if trigger condition is met. `previousValue` is the value compared at
// the previous evaluation (alerts.last_value); drops_by / rises_by cannot fire
// without it — the first run only records a baseline.
export function checkTriggerCondition(
  condition: string,
  value: number,
  threshold: number,
  previousValue?: number
): boolean {
  switch (condition) {
    case 'greater_than':
      return value > threshold;
    case 'less_than':
      return value < threshold;
    case 'equal_to':
      return value === threshold;
    case 'not_equal_to':
      return value !== threshold;
    case 'drops_by':
      if (previousValue === undefined) return false;
      return (previousValue - value) >= threshold;
    case 'rises_by':
      if (previousValue === undefined) return false;
      return (value - previousValue) >= threshold;
    default:
      return value > threshold;
  }
}

// Normalize a stored trigger_type to a canonical value the evaluator understands.
// Production alerts were created with legacy/UI values ('threshold', 'results_count')
// that matched no switch case, leaving every alert permanently un-fireable. This
// maps historical aliases onto the four canonical types and defaults unknown
// values to number_of_results rather than silently dropping the alert.
export function normalizeTriggerType(raw: string | undefined | null): AlertTriggerType {
  switch ((raw || '').toLowerCase()) {
    case 'number_of_hosts':
    case 'host_count':
    case 'hosts':
      return 'number_of_hosts';
    case 'custom_condition':
    case 'custom':
      return 'custom_condition';
    case 'no_data':
    case 'nodata':
    case 'no_results':
      return 'no_data';
    case 'number_of_results':
    case 'results_count':
    case 'result_count':
    case 'threshold':
    case 'count':
    default:
      return 'number_of_results';
  }
}

// Choose the value a number_of_results alert compares against its threshold.
// For an aggregate that collapses to a single numeric cell (e.g. `stats count`,
// `stats avg(x)`), the meaningful value is that cell — not the row count, which
// is always 1. This is what makes the "Logging Dead" monitors (`stats count`
// with `less_than 1`) actually fire when a source goes silent. For raw result
// sets we fall back to the row count.
function getComparisonValue(
  results: Record<string, unknown>[],
  resultCount: number
): number {
  if (results.length === 1) {
    const row = results[0] as Record<string, unknown>;
    const keys = Object.keys(row);
    const countKey = keys.find((k) => k === 'count' || k === 'count_all');
    if (countKey !== undefined) {
      const n = Number(row[countKey]);
      if (Number.isFinite(n)) return n;
    }
    // Single numeric column from any other aggregation.
    if (keys.length === 1) {
      const n = Number(row[keys[0]]);
      if (Number.isFinite(n)) return n;
    }
  }
  return resultCount;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#b91c1c',
  high: '#c2410c',
  medium: '#b45309',
  low: '#4d7c0f',
  info: '#5A3F24',
};

/**
 * Branded HTML alert email with the triggering results as a table. Exported
 * for tests.
 */
export function renderAlertEmailHtml(
  alert: Pick<Alert, 'name' | 'severity' | 'search_query' | 'description'>,
  resultCount: number,
  sampleResults: Record<string, unknown>[]
): string {
  const accent = SEVERITY_COLORS[alert.severity.toLowerCase()] || SEVERITY_COLORS.info;
  const columns = sampleResults.length > 0 ? Object.keys(sampleResults[0]).slice(0, 8) : [];
  const rows = sampleResults.slice(0, 10);
  const baseUrl = process.env.BASE_URL || '';
  const searchLink = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(alert.search_query)}`
    : '';

  const table = columns.length === 0
    ? '<p style="color:#6b7280;font-size:14px">No matching events in the window.</p>'
    : `<table style="border-collapse:collapse;width:100%;font-size:13px">
  <thead><tr>${columns.map(c => `<th style="text-align:left;padding:8px 10px;background:#F5F0E8;border-bottom:2px solid #e5ded3;color:#5A3F24;font-weight:600">${escapeHtml(c)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${columns.map(c => `<td style="padding:8px 10px;border-bottom:1px solid #eee7dc;vertical-align:top;font-family:ui-monospace,Menlo,monospace;word-break:break-word">${escapeHtml(typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c])}</td>`).join('')}</tr>`).join('')}</tbody>
</table>${resultCount > rows.length ? `<p style="color:#6b7280;font-size:12px;margin-top:8px">Showing ${rows.length} of ${resultCount.toLocaleString()} results.</p>` : ''}`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(alert.name)}</title></head>
<body style="margin:0;padding:24px;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937">
  <div style="max-width:800px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5ded3">
    <div style="background:${accent};color:#ffffff;padding:20px 24px">
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">${escapeHtml(alert.severity)} alert</div>
      <h1 style="margin:4px 0 0;font-size:20px;font-weight:700">${escapeHtml(alert.name)}</h1>
    </div>
    <div style="padding:20px 24px">
      ${alert.description ? `<p style="margin:0 0 12px;font-size:14px">${escapeHtml(alert.description)}</p>` : ''}
      <table style="font-size:13px;margin-bottom:16px"><tbody>
        <tr><td style="color:#6b7280;padding:2px 12px 2px 0">Triggered</td><td>${escapeHtml(new Date().toUTCString())}</td></tr>
        <tr><td style="color:#6b7280;padding:2px 12px 2px 0">Results</td><td>${resultCount.toLocaleString()}</td></tr>
        <tr><td style="color:#6b7280;padding:2px 12px 2px 0">Search</td><td><code style="font-family:ui-monospace,Menlo,monospace;background:#F5F0E8;padding:2px 6px;border-radius:4px">${escapeHtml(alert.search_query)}</code></td></tr>
      </tbody></table>
      ${table}
      ${searchLink ? `<p style="margin-top:20px"><a href="${escapeHtml(searchLink)}" style="display:inline-block;background:#5A3F24;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">Open in LogNog</a></p>` : ''}
    </div>
    <div style="padding:12px 24px;background:#F5F0E8;color:#8a7b6b;font-size:12px">Sent by LogNog alerting</div>
  </div>
</body></html>`;
}

// Execute email action
async function executeEmailAction(
  alert: Alert,
  action: AlertAction,
  resultCount: number,
  sampleResults: Record<string, unknown>[]
): Promise<{ success: boolean; message: string }> {
  try {
    const config = action.config;
    if (!config.to) {
      return { success: false, message: 'No recipient specified' };
    }

    // Create transporter (uses SMTP settings from environment; same defaults
    // as scheduled reports so one SMTP config serves both)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      } : undefined,
    });

    // Alert metadata for variable substitution
    const alertMetadata = {
      alert_name: alert.name,
      alert_severity: alert.severity.toUpperCase(),
      result_count: resultCount,
      timestamp: new Date().toISOString(),
    };

    // Build email with variable substitution
    const defaultSubject = `[LogNog Alert] ${alert.name} - ${alert.severity.toUpperCase()}`;
    const defaultBody = `
Alert: ${alert.name}
Severity: ${alert.severity.toUpperCase()}
Time: ${new Date().toISOString()}
Results: ${resultCount}

Search Query: ${alert.search_query}

Sample Results:
${JSON.stringify(sampleResults.slice(0, 5), null, 2)}

---
This alert was generated by LogNog.
    `.trim();

    const subject = substituteVariables(
      config.subject || defaultSubject,
      sampleResults,
      alertMetadata
    );
    const body = substituteVariables(
      config.body || defaultBody,
      sampleResults,
      alertMetadata
    );

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'lognog@localhost',
      to: config.to,
      subject,
      text: body,
      // Custom bodies are the author's own text; the default gets a branded
      // HTML rendering with the results inline (Splunk-style) instead of a
      // JSON dump.
      html: config.body ? undefined : renderAlertEmailHtml(alert, resultCount, sampleResults),
    });

    return { success: true, message: `Email sent to ${config.to}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `Email failed: ${message}` };
  }
}

// Execute webhook action
async function executeWebhookAction(
  alert: Alert,
  action: AlertAction,
  resultCount: number,
  sampleResults: Record<string, unknown>[]
): Promise<{ success: boolean; message: string }> {
  try {
    const config = action.config;
    if (!config.url) {
      return { success: false, message: 'No URL specified' };
    }

    // Alert metadata for variable substitution
    const alertMetadata = {
      alert_name: alert.name,
      alert_severity: alert.severity.toUpperCase(),
      result_count: resultCount,
      timestamp: new Date().toISOString(),
    };

    const method = config.method || 'POST';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    // Build payload with variable substitution
    let payload: string;
    if (config.payload) {
      // Use custom payload template with full variable substitution
      payload = substituteVariables(config.payload, sampleResults, alertMetadata);
    } else {
      // Default payload
      payload = JSON.stringify({
        alert: {
          id: alert.id,
          name: alert.name,
          severity: alert.severity,
          search_query: alert.search_query,
        },
        trigger: {
          timestamp: new Date().toISOString(),
          result_count: resultCount,
        },
        sample_results: sampleResults.slice(0, 10),
      });
    }

    // Add timeout to prevent hanging on slow webhooks
    const WEBHOOK_TIMEOUT_MS = 30000; // 30 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    try {
      const response = await fetch(config.url, {
        method,
        headers,
        body: method !== 'GET' ? payload : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { success: true, message: `Webhook ${method} ${config.url} - ${response.status}` };
      } else {
        return { success: false, message: `Webhook failed: ${response.status} ${response.statusText}` };
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return { success: false, message: `Webhook timed out after ${WEBHOOK_TIMEOUT_MS / 1000} seconds` };
      }
      throw fetchError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `Webhook failed: ${message}` };
  }
}

// Execute log action (write to file or console)
async function executeLogAction(
  alert: Alert,
  action: AlertAction,
  resultCount: number
): Promise<{ success: boolean; message: string }> {
  const logMessage = `[${new Date().toISOString()}] ALERT: ${alert.name} (${alert.severity}) - ${resultCount} results`;
  console.log(logMessage);
  return { success: true, message: 'Logged to console' };
}

// Execute Apprise action (113+ notification services)
async function executeAppriseAction(
  alert: Alert,
  action: AlertAction,
  resultCount: number,
  sampleResults: Record<string, unknown>[]
): Promise<{ success: boolean; message: string }> {
  try {
    const config = action.config;
    const appriseApiUrl = process.env.APPRISE_URL || 'http://apprise:8000';

    // Get Apprise URL - either from configured channel or direct URL
    let appriseUrl: string | undefined;
    let channelName: string | undefined;

    if (config.channel) {
      // The UI stores the channel id; older alerts stored the name. Accept both.
      const channel = resolveNotificationChannel(config.channel);
      if (!channel) {
        return { success: false, message: `Notification channel "${config.channel}" not found` };
      }
      if (!channel.enabled) {
        return { success: false, message: `Notification channel "${config.channel}" is disabled` };
      }
      appriseUrl = channel.apprise_url;
      channelName = channel.name;
    } else if (config.apprise_urls) {
      // Direct Apprise URL(s)
      appriseUrl = config.apprise_urls;
    } else {
      return { success: false, message: 'No notification channel or Apprise URL specified' };
    }

    // Build template context for enhanced template engine
    const templateContext: TemplateContext = {
      alert_name: alert.name,
      alert_severity: alert.severity.toUpperCase(),
      result_count: resultCount,
      timestamp: new Date().toISOString(),
      search_query: alert.search_query,
      results: sampleResults,
      result: sampleResults[0],
    };

    // Check if {{ai_summary}} is used in templates
    const needsAI = (config.title?.includes('{{ai_summary}}') || config.message?.includes('{{ai_summary}}'));
    if (needsAI) {
      templateContext.ai_summary = await generateAISummary(templateContext);
    }

    // Build title and message with enhanced template engine
    const defaultTitle = `[{{alert_severity:badge}}] {{alert_name}}`;
    const defaultMessage = `Alert: {{alert_name}}
Severity: {{alert_severity}}
Time: {{timestamp:relative}}
Results: {{result_count:comma}}

Query: ${alert.search_query.substring(0, 200)}`;

    const title = processTemplate(config.title || defaultTitle, templateContext);
    const body = processTemplate(config.message || defaultMessage, templateContext);

    // Map alert severity to Apprise notification type
    const getAppriseType = (severity: string): string => {
      switch (severity.toLowerCase()) {
        case 'critical':
        case 'high':
          return 'failure';
        case 'medium':
          return 'warning';
        case 'low':
        case 'info':
        default:
          return 'info';
      }
    };

    // Send via Apprise API
    const response = await fetch(`${appriseApiUrl}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls: appriseUrl,
        title,
        body,
        type: getAppriseType(alert.severity),
        format: config.format || 'text',
      }),
    });

    if (response.ok) {
      const destination = channelName ? `channel "${channelName}"` : 'Apprise';
      return { success: true, message: `Notification sent via ${destination}` };
    } else {
      const errorText = await response.text();
      return {
        success: false,
        message: `Apprise notification failed: ${response.status} - ${errorText.substring(0, 100)}`,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `Apprise action failed: ${message}` };
  }
}

// Execute script action (run a command)
async function executeScriptAction(
  alert: Alert,
  action: AlertAction,
  resultCount: number,
  sampleResults: Record<string, unknown>[]
): Promise<{ success: boolean; message: string }> {
  try {
    const config = action.config;
    if (!config.command) {
      return { success: false, message: 'No command specified' };
    }

    // Alert metadata for variable substitution in command
    const alertMetadata = {
      alert_name: alert.name,
      alert_severity: alert.severity.toUpperCase(),
      result_count: resultCount,
      timestamp: new Date().toISOString(),
    };

    // Substitute variables in command with shell sanitization enabled
    // This is CRITICAL for security - prevents command injection via log content
    const command = substituteVariables(config.command, sampleResults, alertMetadata, true);

    // Set up environment variables for the script
    const env = {
      ...process.env,
      LOGNOG_ALERT_NAME: alert.name,
      LOGNOG_ALERT_SEVERITY: alert.severity,
      LOGNOG_ALERT_RESULT_COUNT: String(resultCount),
      LOGNOG_ALERT_QUERY: alert.search_query,
      LOGNOG_ALERT_RESULTS_JSON: JSON.stringify(sampleResults.slice(0, 10)),
    };

    // Execute command with spawn
    const { spawn } = await import('child_process');
    const child = spawn(command, [], {
      shell: true,
      env,
    });

    const SCRIPT_TIMEOUT_MS = 30000; // 30 second timeout

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      // Manual timeout since spawn doesn't support timeout option
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        // Force kill if SIGTERM doesn't work after 5 seconds
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, SCRIPT_TIMEOUT_MS);

      child.stdout?.on('data', (data) => { stdout += data; });
      child.stderr?.on('data', (data) => { stderr += data; });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        if (killed) {
          resolve({
            success: false,
            message: `Script timed out after ${SCRIPT_TIMEOUT_MS / 1000} seconds`,
          });
        } else if (code === 0) {
          resolve({
            success: true,
            message: `Script executed successfully${stdout ? `: ${stdout.substring(0, 100)}` : ''}`,
          });
        } else {
          resolve({
            success: false,
            message: `Script failed with code ${code}${stderr ? `: ${stderr.substring(0, 100)}` : ''}`,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        resolve({ success: false, message: `Script error: ${err.message}` });
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `Script action failed: ${message}` };
  }
}

// Parse duration string like "24h", "7d" to milliseconds
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) return 24 * 60 * 60 * 1000; // Default 24 hours

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'w': return value * 7 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

// Execute show_on_login action - queue notification for display on login
async function executeShowOnLoginAction(
  alert: Alert,
  action: AlertAction,
  resultCount: number,
  sampleResults: Record<string, unknown>[]
): Promise<{ success: boolean; message: string }> {
  try {
    const config = action.config;

    // Alert metadata for variable substitution
    const alertMetadata = {
      alert_name: alert.name,
      alert_severity: alert.severity.toUpperCase(),
      result_count: resultCount,
      timestamp: new Date().toISOString(),
    };

    // Process title and message templates
    const title = substituteVariables(config.title || alert.name, sampleResults, alertMetadata);
    const message = substituteVariables(
      config.message || `Alert "${alert.name}" triggered with ${resultCount} results`,
      sampleResults,
      alertMetadata
    );

    // Calculate expiration if specified
    let expiresAt: string | null = null;
    if (config.expires_in) {
      const expiresMs = parseDuration(config.expires_in);
      expiresAt = new Date(Date.now() + expiresMs).toISOString();
    }

    // Create the login notification
    createLoginNotification(alert.name, title, message, {
      user_id: config.user_id || null,
      alert_id: alert.id,
      severity: alert.severity as AlertSeverity,
      expires_at: expiresAt,
    });

    return {
      success: true,
      message: `Login notification queued${config.user_id ? ` for user ${config.user_id}` : ' for all users'}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `Show on login action failed: ${message}` };
  }
}

// Execute all actions for an alert
async function executeActions(
  alert: Alert,
  resultCount: number,
  sampleResults: Record<string, unknown>[]
): Promise<{ type: string; success: boolean; message: string }[]> {
  let actions: AlertAction[];
  try {
    actions = JSON.parse(alert.actions || '[]');
  } catch {
    console.error(`[Alert ${alert.name}] Failed to parse actions JSON:`, alert.actions);
    return [{ type: 'unknown', success: false, message: 'Invalid actions JSON' }];
  }
  const results: { type: string; success: boolean; message: string }[] = [];

  for (const action of actions) {
    if (!action.config) {
      results.push({ type: action.type, success: false, message: 'Action missing config' });
      continue;
    }
    let result: { success: boolean; message: string };

    switch (action.type) {
      case 'email':
        result = await executeEmailAction(alert, action, resultCount, sampleResults);
        break;
      case 'webhook':
        result = await executeWebhookAction(alert, action, resultCount, sampleResults);
        break;
      case 'log':
        result = await executeLogAction(alert, action, resultCount);
        break;
      case 'apprise':
        result = await executeAppriseAction(alert, action, resultCount, sampleResults);
        break;
      case 'script':
        result = await executeScriptAction(alert, action, resultCount, sampleResults);
        break;
      case 'show_on_login':
        result = await executeShowOnLoginAction(alert, action, resultCount, sampleResults);
        break;
      default:
        result = { success: false, message: `Unknown action type: ${action.type}` };
    }

    results.push({ type: action.type, ...result });
  }

  return results;
}

// Evaluate a single alert
export async function evaluateAlert(alertId: string): Promise<{
  triggered: boolean;
  resultCount: number;
  message: string;
}> {
  const alert = getAlert(alertId);
  if (!alert) {
    return { triggered: false, resultCount: 0, message: 'Alert not found' };
  }

  if (!alert.enabled) {
    return { triggered: false, resultCount: 0, message: 'Alert is disabled' };
  }

  const startTime = performance.now();

  try {
    // Calculate time range
    const timeRangeMs = parseTimeRange(alert.time_range);
    const earliest = new Date(Date.now() - timeRangeMs).toISOString();
    const latest = new Date().toISOString();

    // Execute the search query
    let results = (await executeDSLQuery(alert.search_query, { earliest, latest })).results as Record<string, unknown>[];
    let resultCount = results.length;

    // Update last_run timestamp (scheduling bookkeeping only — the scheduler's
    // cron matcher uses this to know the alert was evaluated this cycle). The
    // *throttle*/double-fire guard is handled atomically via claimAlertTrigger()
    // below, keyed on last_triggered, not last_run (issue #39 bug 4).
    updateAlert(alertId, {
      last_run: new Date().toISOString(),
      last_error: null,
      last_status: 'ok',
    });

    // Check trigger condition
    let triggered = false;
    let uniqueHostCount = 0;
    const triggerType = normalizeTriggerType(alert.trigger_type);
    const comparisonValue = getComparisonValue(
      results as Record<string, unknown>[],
      resultCount
    );

    const previousValue = typeof alert.last_value === 'number' ? alert.last_value : undefined;

    switch (triggerType) {
      case 'number_of_results':
        triggered = checkTriggerCondition(
          alert.trigger_condition,
          comparisonValue,
          alert.trigger_threshold,
          previousValue
        );
        break;

      case 'number_of_hosts':
        // Count unique hosts (rows without any host field don't count as one)
        const uniqueHosts = new Set(
          results
            .map((r: Record<string, unknown>) => r.hostname || r.host || r.source)
            .filter(Boolean)
        );
        uniqueHostCount = uniqueHosts.size;
        triggered = checkTriggerCondition(
          alert.trigger_condition,
          uniqueHostCount,
          alert.trigger_threshold,
          previousValue
        );
        break;

      case 'custom_condition':
        // Secondary search over the results: keep only rows satisfying the
        // DSL condition and fire if any remain. Without a condition (legacy
        // alerts) this degrades to "any results".
        if (alert.custom_condition) {
          results = filterRowsByDslCondition(results, alert.custom_condition);
          resultCount = results.length;
        }
        triggered = resultCount > 0;
        break;

      case 'no_data':
        // Per-query silence alarm: fire when the search returns NOTHING in the window
        triggered = resultCount === 0;
        break;
    }

    // Baseline for the next drops_by / rises_by comparison.
    const observedValue = triggerType === 'number_of_hosts' ? uniqueHostCount : comparisonValue;
    updateAlert(alertId, { last_value: observedValue });

    if (!triggered) {
      const duration_ms = Math.round(performance.now() - startTime);
      logAlertEvaluated({
        alert_id: alertId,
        alert_name: alert.name,
        duration_ms,
        result_count: resultCount,
        triggered: false,
      });
      return { triggered: false, resultCount, message: 'Condition not met' };
    }

    // Check if alert is silenced. Global and alert-level silences apply
    // outright; a host-level silence only suppresses the alert when every
    // host in the results is silenced (previously only row 0 was consulted,
    // so a silence for web-02 did nothing if web-01 happened to sort first).
    const hostnames = Array.from(new Set(
      results
        .map((r: Record<string, unknown>) => r.hostname)
        .filter((h): h is string => typeof h === 'string' && h.length > 0)
    ));
    const silenced = isAlertSilenced(alertId)
      || (hostnames.length > 0 && hostnames.every(h => isAlertSilenced(alertId, h)));

    if (silenced) {
      const duration_ms = Math.round(performance.now() - startTime);
      logAlertEvaluated({
        alert_id: alertId,
        alert_name: alert.name,
        duration_ms,
        result_count: resultCount,
        triggered: true,
        silenced: true,
      });
      return {
        triggered: false,
        resultCount,
        message: 'Alert is silenced',
      };
    }

    // Atomic throttle + double-fire guard (issue #39 bug 4).
    //
    // Instead of a read-then-write (getRecentAlertTrigger followed by a separate
    // last_triggered update) which let concurrent evaluations both fire, we
    // claim the trigger slot with a single conditional UPDATE. Exactly one
    // evaluation wins per throttle window; losers are throttled.
    const nowIso = new Date().toISOString();
    const windowSeconds = alert.throttle_enabled ? (alert.throttle_window_seconds || 0) : 0;
    // windowStart = now - windowSeconds. With throttle disabled, windowSeconds=0
    // so windowStart=now: the claim still serializes same-instant duplicates but
    // imposes no cross-time throttle.
    const windowStartIso = new Date(Date.now() - windowSeconds * 1000).toISOString();

    // Splunk "trigger for each result": one notification + history entry per
    // row, suppressed per throttle-field value within the window.
    if (alert.trigger_mode === 'per_result' && triggerType !== 'no_data' && results.length > 0) {
      return await firePerResult(alert, results as Record<string, unknown>[], nowIso, windowStartIso, startTime);
    }

    const claimed = claimAlertTrigger(alertId, nowIso, windowStartIso);
    if (!claimed) {
      const duration_ms = Math.round(performance.now() - startTime);
      logAlertEvaluated({
        alert_id: alertId,
        alert_name: alert.name,
        duration_ms,
        result_count: resultCount,
        triggered: true,
        throttled: true,
      });
      return {
        triggered: false,
        resultCount,
        message: 'Throttled - already triggered within throttle window',
      };
    }

    // We won the throttle slot. Execute actions.
    const actionResults = await executeActions(
      alert,
      resultCount,
      results.slice(0, 10) as Record<string, unknown>[]
    );

    // Record in history. For aggregate searches (`stats count`) the value the
    // condition was judged on is the single count cell, not the row count.
    const triggerValue = triggerType === 'number_of_hosts'
      ? uniqueHostCount
      : triggerType === 'number_of_results' ? comparisonValue : resultCount;
    createAlertHistoryEntry(
      alertId,
      resultCount,
      alert.severity as AlertSeverity,
      {
        trigger_value: String(triggerValue),
        actions_executed: actionResults,
        sample_results: results.slice(0, 5) as Record<string, unknown>[],
      }
    );

    // (last_triggered and trigger_count were already updated atomically by
    // claimAlertTrigger above.) Mark the alert as fired so the list can show it.
    updateAlert(alertId, { last_status: 'triggered' });
    disableIfExhausted(alertId);

    // Create agent notification (push to system tray) with variable substitution
    const alertMetadata = {
      alert_name: alert.name,
      alert_severity: alert.severity.toUpperCase(),
      result_count: resultCount,
      timestamp: new Date().toISOString(),
    };

    const notificationTitle = substituteVariables(
      `Alert: ${alert.name}`,
      results.slice(0, 10) as Record<string, unknown>[],
      alertMetadata
    );

    const notificationMessage = substituteVariables(
      `${alert.severity.toUpperCase()} - ${resultCount} results found matching: ${alert.search_query.substring(0, 100)}`,
      results.slice(0, 10) as Record<string, unknown>[],
      alertMetadata
    );

    createAgentNotification(
      alert.name,
      notificationTitle,
      notificationMessage,
      {
        alert_id: alertId,
        severity: alert.severity as AlertSeverity,
        // Expire after 24 hours
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }
    );

    console.log(`Alert triggered: ${alert.name} (${resultCount} results)`);

    // Log alert triggered
    const duration_ms = Math.round(performance.now() - startTime);
    logAlertEvaluated({
      alert_id: alertId,
      alert_name: alert.name,
      duration_ms,
      result_count: resultCount,
      triggered: true,
    });

    // Log each action result
    for (const result of actionResults) {
      logAlertAction({
        alert_id: alertId,
        alert_name: alert.name,
        action_type: result.type,
        success: result.success,
        message: result.message,
      });
    }

    return {
      triggered: true,
      resultCount,
      message: `Alert triggered - ${actionResults.filter(r => r.success).length}/${actionResults.length} actions succeeded`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error evaluating alert ${alert.name}:`, errorMessage);

    // Persist the failure so the UI can surface a broken alert instead of
    // showing it as healthy (previously these failures were console-only and
    // went unnoticed for months).
    try {
      updateAlert(alertId, {
        last_run: new Date().toISOString(),
        last_error: errorMessage,
        last_status: 'error',
      });
    } catch {
      // Never let health-bookkeeping mask the original evaluation error.
    }

    const duration_ms = Math.round(performance.now() - startTime);
    logAlertEvaluated({
      alert_id: alertId,
      alert_name: alert.name,
      duration_ms,
      result_count: 0,
      triggered: false,
      error: errorMessage,
    });

    return { triggered: false, resultCount: 0, message: `Error: ${errorMessage}` };
  }
}

const PER_RESULT_MAX_ROWS = 50;

// Fire-once / limited alerts: once trigger_count reaches max_triggers the
// alert disables itself (a "Test Alert - Fire Once" in prod had been firing
// every minute for weeks because no such concept existed).
function disableIfExhausted(alertId: string): void {
  const fresh = getAlert(alertId);
  if (!fresh || !fresh.max_triggers) return;
  if ((fresh.trigger_count || 0) >= fresh.max_triggers) {
    updateAlert(alertId, { enabled: false });
    console.log(`Alert "${fresh.name}" reached its trigger limit (${fresh.max_triggers}) and was disabled`);
  }
}

// Throttle key for one result row: the values of the configured throttle
// fields ("hostname=web-01|app_name=api"); with no fields configured, the
// whole row identifies the result.
export function throttleKeyForRow(row: Record<string, unknown>, throttleFields: string | null | undefined): string {
  const fields = (throttleFields || '').split(',').map(f => f.trim()).filter(Boolean);
  if (fields.length === 0) return JSON.stringify(row);
  return fields.map(f => `${f}=${row[f] === undefined || row[f] === null ? '' : String(row[f])}`).join('|');
}

async function firePerResult(
  alert: Alert,
  results: Record<string, unknown>[],
  nowIso: string,
  windowStartIso: string,
  startTime: number
): Promise<{ triggered: boolean; resultCount: number; message: string }> {
  const rows = results.slice(0, PER_RESULT_MAX_ROWS);
  let fired = 0;
  let succeededActions = 0;
  let totalActions = 0;

  for (const row of rows) {
    const key = throttleKeyForRow(row, alert.throttle_fields);
    if (!claimAlertTriggerKey(alert.id, key, nowIso, windowStartIso)) continue;
    fired += 1;

    const actionResults = await executeActions(alert, 1, [row]);
    totalActions += actionResults.length;
    succeededActions += actionResults.filter(r => r.success).length;

    createAlertHistoryEntry(alert.id, 1, alert.severity as AlertSeverity, {
      trigger_value: key,
      actions_executed: actionResults,
      sample_results: [row],
    });
    for (const result of actionResults) {
      logAlertAction({
        alert_id: alert.id,
        alert_name: alert.name,
        action_type: result.type,
        success: result.success,
        message: result.message,
      });
    }
  }

  const duration_ms = Math.round(performance.now() - startTime);
  if (fired === 0) {
    logAlertEvaluated({
      alert_id: alert.id,
      alert_name: alert.name,
      duration_ms,
      result_count: results.length,
      triggered: true,
      throttled: true,
    });
    return {
      triggered: false,
      resultCount: results.length,
      message: 'Throttled - every result already triggered within the throttle window',
    };
  }

  recordAlertFired(alert.id, nowIso, fired);
  updateAlert(alert.id, { last_status: 'triggered' });
  disableIfExhausted(alert.id);

  createAgentNotification(
    alert.name,
    `Alert: ${alert.name}`,
    `${alert.severity.toUpperCase()} - ${fired} of ${results.length} results fired: ${alert.search_query.substring(0, 100)}`,
    {
      alert_id: alert.id,
      severity: alert.severity as AlertSeverity,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }
  );

  console.log(`Alert triggered: ${alert.name} (${fired}/${results.length} results)`);
  logAlertEvaluated({
    alert_id: alert.id,
    alert_name: alert.name,
    duration_ms,
    result_count: results.length,
    triggered: true,
  });

  return {
    triggered: true,
    resultCount: results.length,
    message: `Alert triggered - ${fired} of ${results.length} results fired, ${succeededActions}/${totalActions} actions succeeded`,
  };
}

// Evaluate all enabled alerts
export async function evaluateAllAlerts(): Promise<{
  evaluated: number;
  triggered: number;
  errors: number;
}> {
  const alerts = getAlerts(true); // Get enabled alerts only
  let evaluated = 0;
  let triggered = 0;
  let errors = 0;

  for (const alert of alerts) {
    const result = await evaluateAlert(alert.id);
    evaluated++;

    if (result.triggered) {
      triggered++;
    } else if (result.message.startsWith('Error:')) {
      errors++;
    }
  }

  return { evaluated, triggered, errors };
}

// Test an alert without saving to history
export async function testAlert(
  searchQuery: string,
  triggerType: string,
  triggerCondition: string,
  triggerThreshold: number,
  timeRange: string,
  customCondition?: string
): Promise<{
  wouldTrigger: boolean;
  resultCount: number;
  sampleResults: Record<string, unknown>[];
  message: string;
}> {
  try {
    // Calculate time range
    const timeRangeMs = parseTimeRange(timeRange);
    const earliest = new Date(Date.now() - timeRangeMs).toISOString();
    const latest = new Date().toISOString();

    // Execute the search query
    let results = (await executeDSLQuery(searchQuery, { earliest, latest })).results as Record<string, unknown>[];
    if (normalizeTriggerType(triggerType) === 'custom_condition' && customCondition) {
      results = filterRowsByDslCondition(results, customCondition);
    }
    const resultCount = results.length;

    // Check trigger condition (mirror evaluateAlert: normalize legacy types and
    // compare the aggregate value for single-cell stats results).
    let wouldTrigger = false;
    const normalizedType = normalizeTriggerType(triggerType);
    const comparisonValue = getComparisonValue(
      results as Record<string, unknown>[],
      resultCount
    );

    switch (normalizedType) {
      case 'number_of_results':
        wouldTrigger = checkTriggerCondition(triggerCondition, comparisonValue, triggerThreshold);
        break;

      case 'number_of_hosts':
        const uniqueHosts = new Set(
          results.map((r: Record<string, unknown>) => r.hostname || r.host || r.source)
        );
        wouldTrigger = checkTriggerCondition(triggerCondition, uniqueHosts.size, triggerThreshold);
        break;

      case 'custom_condition':
        wouldTrigger = resultCount > 0;
        break;

      case 'no_data':
        wouldTrigger = resultCount === 0;
        break;
    }

    return {
      wouldTrigger,
      resultCount,
      sampleResults: results.slice(0, 10) as Record<string, unknown>[],
      message: wouldTrigger
        ? `Would trigger (${resultCount} results)`
        : `Would not trigger (${resultCount} results)`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      wouldTrigger: false,
      resultCount: 0,
      sampleResults: [],
      message: `Error: ${message}`,
    };
  }
}
