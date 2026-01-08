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
  getAlerts,
  getAlert,
  updateAlert,
  createAlertHistoryEntry,
  getRecentAlertTrigger,
  createAgentNotification,
  createLoginNotification,
  isAlertSilenced,
  getNotificationChannelByName,
} from '../db/sqlite.js';
import { executeDSLQuery, getBackend } from '../db/backend.js';
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
function escapeShellArg(arg: string): string {
  // Remove or escape dangerous shell metacharacters
  // This prevents command injection attacks like: ; rm -rf / or $(malicious)
  return arg.replace(/[;&|`$(){}[\]\\!#*?<>~'"]/g, '');
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

// Check if trigger condition is met
function checkTriggerCondition(
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

    // Create transporter (uses SMTP settings from environment)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '25', 10),
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
      // Look up channel by name
      const channel = getNotificationChannelByName(config.channel);
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
  const actions: AlertAction[] = JSON.parse(alert.actions || '[]');
  const results: { type: string; success: boolean; message: string }[] = [];

  for (const action of actions) {
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
    const { results } = await executeDSLQuery(alert.search_query, { earliest, latest });
    const resultCount = results.length;

    // Update last_run timestamp
    updateAlert(alertId, { last_run: new Date().toISOString() });

    // Check trigger condition
    let triggered = false;

    switch (alert.trigger_type) {
      case 'number_of_results':
        triggered = checkTriggerCondition(
          alert.trigger_condition,
          resultCount,
          alert.trigger_threshold
        );
        break;

      case 'number_of_hosts':
        // Count unique hosts
        const uniqueHosts = new Set(
          results.map((r: Record<string, unknown>) => r.hostname || r.host || r.source)
        );
        triggered = checkTriggerCondition(
          alert.trigger_condition,
          uniqueHosts.size,
          alert.trigger_threshold
        );
        break;

      case 'custom_condition':
        // For custom conditions, just check if any results
        triggered = resultCount > 0;
        break;
    }

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

    // Check if alert is silenced
    // Extract hostname from results if available
    const hostname = results.length > 0
      ? (results[0] as Record<string, unknown>).hostname as string || undefined
      : undefined;

    if (isAlertSilenced(alertId, hostname)) {
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

    // Check throttling
    if (alert.throttle_enabled) {
      const recentTrigger = getRecentAlertTrigger(alertId, alert.throttle_window_seconds);
      if (recentTrigger) {
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
          message: `Throttled - last triggered at ${recentTrigger.triggered_at}`,
        };
      }
    }

    // Execute actions
    const actionResults = await executeActions(
      alert,
      resultCount,
      results.slice(0, 10) as Record<string, unknown>[]
    );

    // Record in history
    createAlertHistoryEntry(
      alertId,
      resultCount,
      alert.severity as AlertSeverity,
      {
        trigger_value: String(resultCount),
        actions_executed: actionResults,
        sample_results: results.slice(0, 5) as Record<string, unknown>[],
      }
    );

    // Update alert statistics
    updateAlert(alertId, {
      last_triggered: new Date().toISOString(),
      trigger_count: (alert.trigger_count || 0) + 1,
    });

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
  timeRange: string
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
    const { results } = await executeDSLQuery(searchQuery, { earliest, latest });
    const resultCount = results.length;

    // Check trigger condition
    let wouldTrigger = false;

    switch (triggerType) {
      case 'number_of_results':
        wouldTrigger = checkTriggerCondition(triggerCondition, resultCount, triggerThreshold);
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
