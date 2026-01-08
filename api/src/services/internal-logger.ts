/**
 * Internal Logger Service - LogNog Self-Monitoring
 *
 * LogNog logs its own operational events to ClickHouse for searchability via DSL.
 * Events are tagged with app_name='lognog-internal' and app_scope='lognog'.
 *
 * STRUCTURED EVENTS: All events have queryable top-level fields:
 *   - action: The event type (e.g., 'api.request', 'auth.login', 'alert.triggered')
 *   - category: Event category (api, auth, search, alert, ingest, system)
 *   - success: Boolean indicating success/failure
 *   - duration_ms: Operation duration
 *   - user_id: User who performed the action
 *   - details: JSON object with action-specific data
 *
 * Query examples:
 *   search app_scope="lognog" action="auth.login_failed" | stats count by user_id
 *   search app_scope="lognog" category="alert" | table timestamp action message
 *   search app_scope="lognog" success=false | stats count by action
 *   search app_scope="lognog" duration_ms>1000 | stats avg(duration_ms) by action
 */

import { insertLogs, isLiteMode } from '../db/backend.js';
import { getSystemSetting } from '../db/sqlite.js';

// Event actions for self-monitoring (dot notation: category.action)
export type EventAction =
  // API events
  | 'api.request'           // HTTP request completed
  | 'api.error'             // HTTP error (4xx/5xx)
  | 'api.slow'              // Slow request (>1s)
  // Authentication events
  | 'auth.login'            // Successful login
  | 'auth.login_failed'     // Failed login attempt
  | 'auth.logout'           // User logged out
  | 'auth.token_refresh'    // Token refreshed
  | 'auth.setup'            // Initial setup completed
  // Search/Query events
  | 'search.query'          // DSL query executed
  | 'search.slow'           // Slow query (>5s)
  | 'search.error'          // Query error
  // Alert events
  | 'alert.evaluated'       // Alert check ran
  | 'alert.triggered'       // Alert condition met
  | 'alert.action_sent'     // Alert action executed
  | 'alert.throttled'       // Alert throttled
  | 'alert.silenced'        // Alert silenced
  | 'alert.error'           // Alert execution error
  // Report events
  | 'report.generated'      // Report created
  | 'report.sent'           // Report emailed
  | 'report.error'          // Report error
  // Ingest events
  | 'ingest.batch'          // Logs ingested
  | 'ingest.error'          // Ingest failure
  // System events
  | 'system.startup'        // API server started
  | 'system.shutdown'       // API server stopping
  | 'system.error'          // Unhandled error
  | 'system.retention'      // Retention cleanup ran
  // AI events
  | 'ai.request'            // AI provider call
  | 'ai.error';             // AI provider error

// Event categories for grouping
export type EventCategory = 'api' | 'auth' | 'search' | 'alert' | 'report' | 'ingest' | 'system' | 'ai';

// Severity levels (syslog standard)
export const SEVERITY = {
  EMERGENCY: 0,
  ALERT: 1,
  CRITICAL: 2,
  ERROR: 3,
  WARNING: 4,
  NOTICE: 5,
  INFO: 6,
  DEBUG: 7,
} as const;

export interface InternalEvent {
  action: EventAction;
  category: EventCategory;
  message: string;           // Human-readable description
  success?: boolean;
  duration_ms?: number;
  user_id?: string;
  details?: Record<string, unknown>;
  severity?: number;
}

// Severity level thresholds for filtering
const SEVERITY_LEVELS: Record<string, number> = {
  'DEBUG': SEVERITY.DEBUG,      // 7
  'INFO': SEVERITY.INFO,        // 6
  'NOTICE': SEVERITY.NOTICE,    // 5
  'WARNING': SEVERITY.WARNING,  // 4
  'ERROR': SEVERITY.ERROR,      // 3
  'CRITICAL': SEVERITY.CRITICAL, // 2
};

// Cache settings to avoid DB hits on every log call
let settingsCache: {
  enabled: boolean;
  level: number;
  categories: Set<string>;
  lastCheck: number;
} | null = null;
const SETTINGS_CACHE_MS = 30000; // Refresh settings every 30 seconds

/**
 * Get internal logging settings (with caching)
 */
function getSettings(): { enabled: boolean; level: number; categories: Set<string> } {
  const now = Date.now();

  if (settingsCache && (now - settingsCache.lastCheck) < SETTINGS_CACHE_MS) {
    return settingsCache;
  }

  try {
    const enabled = getSystemSetting('internal_logging_enabled') || 'false';
    const level = getSystemSetting('internal_logging_level') || 'WARNING';
    const categories = getSystemSetting('internal_logging_categories') || 'auth,alert,system';

    settingsCache = {
      enabled: enabled === 'true',
      level: SEVERITY_LEVELS[level] ?? SEVERITY.WARNING,
      categories: new Set(categories.split(',').filter(Boolean)),
      lastCheck: now,
    };
  } catch {
    // DB might not be ready yet (startup), use defaults
    settingsCache = {
      enabled: false,
      level: SEVERITY.WARNING,
      categories: new Set(['auth', 'alert', 'system']),
      lastCheck: now,
    };
  }

  return settingsCache;
}

/**
 * Check if self-monitoring is enabled for a given event
 */
function shouldLog(severity: number, category: EventCategory): boolean {
  // Check env var override first (allows disabling completely)
  const envEnabled = process.env.LOGNOG_SELF_MONITORING;
  if (envEnabled === 'false' || envEnabled === '0') {
    return false;
  }

  const settings = getSettings();

  // Check if enabled
  if (!settings.enabled) {
    return false;
  }

  // Check severity (lower number = more severe, so we log if severity <= threshold)
  if (severity > settings.level) {
    return false;
  }

  // Check category
  if (!settings.categories.has(category)) {
    return false;
  }

  return true;
}

// Legacy function for backwards compatibility
function isEnabled(): boolean {
  const envEnabled = process.env.LOGNOG_SELF_MONITORING;
  if (envEnabled === 'false' || envEnabled === '0') {
    return false;
  }
  const settings = getSettings();
  return settings.enabled;
}

// Queue for batching logs (reduces DB writes)
let eventQueue: Record<string, unknown>[] = [];
let flushTimer: NodeJS.Timeout | null = null;
const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 5000;

/**
 * Flush queued events to the database
 */
async function flushQueue(): Promise<void> {
  if (eventQueue.length === 0) return;

  const eventsToFlush = eventQueue;
  eventQueue = [];

  try {
    await insertLogs(eventsToFlush);
  } catch (error) {
    // Don't recursively log errors about logging
    console.error('[InternalLogger] Failed to flush events:', error);
    // Don't re-queue to avoid infinite loops
  }
}

/**
 * Start flush timer if not already running
 */
function ensureFlushTimer(): void {
  if (!flushTimer) {
    flushTimer = setInterval(async () => {
      await flushQueue();
    }, FLUSH_INTERVAL_MS);

    // Don't let the timer prevent process exit
    flushTimer.unref();
  }
}

/**
 * Log an internal operational event
 *
 * Events are stored with queryable top-level fields for easy filtering.
 *
 * @param event - The event to log
 * @returns Promise that resolves when event is queued
 */
export async function logInternalEvent(event: InternalEvent): Promise<void> {
  const severity = event.severity ?? SEVERITY.INFO;

  // Check if this event should be logged based on settings
  if (!shouldLog(severity, event.category)) return;

  const timestamp = new Date();

  // Build the log entry matching ClickHouse schema
  // Note: ClickHouse DateTime64 doesn't accept 'Z' suffix, need space-separated format
  const ts = timestamp.toISOString().replace('T', ' ').replace('Z', '');

  // Build structured data with queryable fields
  const structuredData: Record<string, unknown> = {
    action: event.action,
    category: event.category,
    success: event.success ?? true,
    ...(event.duration_ms !== undefined && { duration_ms: event.duration_ms }),
    ...(event.user_id && { user_id: event.user_id }),
    ...(event.details && { details: event.details }),
  };

  const logEntry: Record<string, unknown> = {
    timestamp: ts,
    received_at: ts,
    severity,
    facility: 1, // user-level
    priority: (1 * 8) + severity, // facility * 8 + severity
    hostname: 'lognog-api',
    app_name: 'lognog-internal',
    app_scope: 'lognog',          // For filtering LogNog's own logs
    proc_id: String(process.pid),
    msg_id: event.action,         // Action as msg_id for easy filtering
    message: event.message,       // Human-readable message
    structured_data: JSON.stringify(structuredData),
    index_name: 'lognog-internal',
    // Add top-level fields for direct querying
    action: event.action,
    category: event.category,
    success: event.success ?? true,
    ...(event.duration_ms !== undefined && { duration_ms: event.duration_ms }),
  };

  // Add to queue
  eventQueue.push(logEntry);

  // Flush if batch size reached
  if (eventQueue.length >= BATCH_SIZE) {
    await flushQueue();
  } else {
    ensureFlushTimer();
  }
}

/**
 * Log an API call (used by middleware)
 */
export function logApiCall(data: {
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  user_id?: string;
  ip?: string;
  user_agent?: string;
}): void {
  const isError = data.status >= 400;
  const isSlow = data.duration_ms >= 1000;

  const severity = data.status >= 500 ? SEVERITY.ERROR :
                   data.status >= 400 ? SEVERITY.WARNING :
                   isSlow ? SEVERITY.WARNING :
                   SEVERITY.INFO;

  // Determine action based on status/speed
  const action: EventAction = data.status >= 400 ? 'api.error' :
                              isSlow ? 'api.slow' :
                              'api.request';

  const statusText = data.status >= 500 ? 'Server error' :
                     data.status >= 400 ? 'Client error' :
                     data.status >= 300 ? 'Redirect' :
                     'OK';

  const slowNote = isSlow ? ' (SLOW)' : '';

  logInternalEvent({
    action,
    category: 'api',
    message: `${data.method} ${data.path} -> ${data.status} ${statusText}${slowNote}`,
    success: !isError,
    duration_ms: data.duration_ms,
    user_id: data.user_id,
    details: {
      method: data.method,
      path: data.path,
      status: data.status,
      ip: data.ip,
      user_agent: data.user_agent,
    },
    severity,
  }).catch(() => {}); // Fire and forget
}

/**
 * Log a DSL query execution
 */
export function logQueryExecution(data: {
  dsl_query: string;
  execution_time_ms: number;
  row_count: number;
  user_id?: string;
  error?: string;
}): void {
  const isError = !!data.error;
  const isSlow = data.execution_time_ms >= 5000;

  const severity = isError ? SEVERITY.ERROR :
                   isSlow ? SEVERITY.WARNING :
                   SEVERITY.INFO;

  const action: EventAction = isError ? 'search.error' :
                              isSlow ? 'search.slow' :
                              'search.query';

  // Truncate long queries for readability
  const shortQuery = data.dsl_query.length > 100
    ? data.dsl_query.substring(0, 97) + '...'
    : data.dsl_query;

  const slowNote = isSlow ? ' (SLOW)' : '';
  const resultInfo = isError
    ? `Error: ${data.error}`
    : `${data.row_count} rows${slowNote}`;

  logInternalEvent({
    action,
    category: 'search',
    message: `Query: ${shortQuery} -> ${resultInfo}`,
    success: !isError,
    duration_ms: data.execution_time_ms,
    user_id: data.user_id,
    details: {
      query: data.dsl_query,
      row_count: data.row_count,
      ...(data.error && { error: data.error }),
    },
    severity,
  }).catch(() => {});
}

/**
 * Log an unhandled error
 */
export function logError(data: {
  error_type: string;
  message: string;
  stack_trace?: string;
  endpoint?: string;
  user_id?: string;
}): void {
  logInternalEvent({
    action: 'system.error',
    category: 'system',
    message: `${data.error_type}: ${data.message}`,
    success: false,
    user_id: data.user_id,
    details: {
      error_type: data.error_type,
      error_message: data.message,
      stack_trace: data.stack_trace,
      endpoint: data.endpoint,
    },
    severity: SEVERITY.ERROR,
  }).catch(() => {});
}

/**
 * Log ingestion statistics
 */
export function logIngestionStats(data: {
  source_type: string;
  event_count: number;
  batch_size?: number;
  duration_ms: number;
  user_id?: string;
  index_name?: string;
  app_name?: string;
  error?: string;
}): void {
  const isError = !!data.error;
  const indexInfo = data.index_name ? ` to ${data.index_name}` : '';
  const appInfo = data.app_name ? ` from ${data.app_name}` : '';

  logInternalEvent({
    action: isError ? 'ingest.error' : 'ingest.batch',
    category: 'ingest',
    message: isError
      ? `Ingest failed via ${data.source_type}: ${data.error}`
      : `Ingested ${data.event_count} events via ${data.source_type}${indexInfo}${appInfo}`,
    success: !isError,
    duration_ms: data.duration_ms,
    user_id: data.user_id,
    details: {
      source_type: data.source_type,
      event_count: data.event_count,
      batch_size: data.batch_size,
      index_name: data.index_name,
      app_name: data.app_name,
      ...(data.error && { error: data.error }),
    },
    severity: isError ? SEVERITY.ERROR : SEVERITY.INFO,
  }).catch(() => {});
}

/**
 * Log AI provider usage
 */
export function logAIRequest(data: {
  provider: 'ollama' | 'openrouter';
  model: string;
  duration_ms: number;
  tokens?: number;
  success: boolean;
  error?: string;
  endpoint?: string;
}): void {
  logInternalEvent({
    action: data.success ? 'ai.request' : 'ai.error',
    category: 'ai',
    message: data.success
      ? `AI ${data.provider}/${data.model} completed in ${data.duration_ms}ms`
      : `AI ${data.provider}/${data.model} failed: ${data.error}`,
    success: data.success,
    duration_ms: data.duration_ms,
    details: {
      provider: data.provider,
      model: data.model,
      tokens: data.tokens,
      endpoint: data.endpoint,
      ...(data.error && { error: data.error }),
    },
    severity: data.success ? SEVERITY.INFO : SEVERITY.WARNING,
  }).catch(() => {});
}

// ============================================
// Authentication Logging
// ============================================

/**
 * Log successful login
 */
export function logAuthLogin(data: {
  user_id: string;
  username?: string;
  ip?: string;
  user_agent?: string;
}): void {
  logInternalEvent({
    action: 'auth.login',
    category: 'auth',
    message: `User ${data.username || data.user_id} logged in`,
    success: true,
    user_id: data.user_id,
    details: {
      username: data.username,
      ip: data.ip,
      user_agent: data.user_agent,
    },
    severity: SEVERITY.INFO,
  }).catch(() => {});
}

/**
 * Log failed login attempt
 */
export function logAuthLoginFailed(data: {
  username: string;
  reason: string;
  ip?: string;
  user_agent?: string;
}): void {
  logInternalEvent({
    action: 'auth.login_failed',
    category: 'auth',
    message: `Login failed for ${data.username}: ${data.reason}`,
    success: false,
    details: {
      username: data.username,
      reason: data.reason,
      ip: data.ip,
      user_agent: data.user_agent,
    },
    severity: SEVERITY.WARNING,
  }).catch(() => {});
}

/**
 * Log logout
 */
export function logAuthLogout(data: {
  user_id: string;
  username?: string;
}): void {
  logInternalEvent({
    action: 'auth.logout',
    category: 'auth',
    message: `User ${data.username || data.user_id} logged out`,
    success: true,
    user_id: data.user_id,
    details: { username: data.username },
    severity: SEVERITY.INFO,
  }).catch(() => {});
}

/**
 * Log initial setup completion
 */
export function logAuthSetup(data: {
  user_id: string;
  username: string;
}): void {
  logInternalEvent({
    action: 'auth.setup',
    category: 'auth',
    message: `Initial setup completed - admin user ${data.username} created`,
    success: true,
    user_id: data.user_id,
    details: { username: data.username },
    severity: SEVERITY.NOTICE,
  }).catch(() => {});
}

// ============================================
// Alert Logging
// ============================================

/**
 * Log alert evaluation
 */
export function logAlertEvaluated(data: {
  alert_id: string;
  alert_name: string;
  duration_ms: number;
  result_count: number;
  triggered: boolean;
  throttled?: boolean;
  silenced?: boolean;
  error?: string;
}): void {
  const action: EventAction = data.error ? 'alert.error' :
                              data.silenced ? 'alert.silenced' :
                              data.throttled ? 'alert.throttled' :
                              data.triggered ? 'alert.triggered' :
                              'alert.evaluated';

  const status = data.error ? `Error: ${data.error}` :
                 data.silenced ? 'Silenced' :
                 data.throttled ? 'Throttled' :
                 data.triggered ? `Triggered (${data.result_count} results)` :
                 `OK (${data.result_count} results)`;

  logInternalEvent({
    action,
    category: 'alert',
    message: `Alert "${data.alert_name}" ${status}`,
    success: !data.error,
    duration_ms: data.duration_ms,
    details: {
      alert_id: data.alert_id,
      alert_name: data.alert_name,
      result_count: data.result_count,
      triggered: data.triggered,
      throttled: data.throttled,
      silenced: data.silenced,
      ...(data.error && { error: data.error }),
    },
    severity: data.triggered ? SEVERITY.NOTICE :
              data.error ? SEVERITY.ERROR :
              SEVERITY.INFO,
  }).catch(() => {});
}

/**
 * Log alert action execution
 */
export function logAlertAction(data: {
  alert_id: string;
  alert_name: string;
  action_type: string;
  success: boolean;
  message: string;
}): void {
  logInternalEvent({
    action: 'alert.action_sent',
    category: 'alert',
    message: `Alert "${data.alert_name}" action ${data.action_type}: ${data.message}`,
    success: data.success,
    details: {
      alert_id: data.alert_id,
      alert_name: data.alert_name,
      action_type: data.action_type,
      result: data.message,
    },
    severity: data.success ? SEVERITY.INFO : SEVERITY.WARNING,
  }).catch(() => {});
}

// ============================================
// Report Logging
// ============================================

/**
 * Log report generation
 */
export function logReportGenerated(data: {
  report_id: string;
  report_name: string;
  duration_ms: number;
  row_count: number;
  sent_to?: string[];
  error?: string;
}): void {
  const action: EventAction = data.error ? 'report.error' :
                              data.sent_to?.length ? 'report.sent' :
                              'report.generated';

  logInternalEvent({
    action,
    category: 'report',
    message: data.error
      ? `Report "${data.report_name}" failed: ${data.error}`
      : data.sent_to?.length
        ? `Report "${data.report_name}" sent to ${data.sent_to.join(', ')}`
        : `Report "${data.report_name}" generated (${data.row_count} rows)`,
    success: !data.error,
    duration_ms: data.duration_ms,
    details: {
      report_id: data.report_id,
      report_name: data.report_name,
      row_count: data.row_count,
      recipients: data.sent_to,
      ...(data.error && { error: data.error }),
    },
    severity: data.error ? SEVERITY.ERROR : SEVERITY.INFO,
  }).catch(() => {});
}

// ============================================
// System Logging
// ============================================

/**
 * Log system startup
 */
export function logSystemStartup(data: {
  version?: string;
  port: number;
}): void {
  logInternalEvent({
    action: 'system.startup',
    category: 'system',
    message: `LogNog API started on port ${data.port}`,
    success: true,
    details: {
      version: data.version,
      port: data.port,
      pid: process.pid,
    },
    severity: SEVERITY.NOTICE,
  }).catch(() => {});
}

/**
 * Log retention cleanup
 */
export function logRetentionCleanup(data: {
  index_name?: string;
  deleted_count: number;
  duration_ms: number;
}): void {
  logInternalEvent({
    action: 'system.retention',
    category: 'system',
    message: `Retention cleanup: deleted ${data.deleted_count} events${data.index_name ? ` from ${data.index_name}` : ''}`,
    success: true,
    duration_ms: data.duration_ms,
    details: {
      index_name: data.index_name,
      deleted_count: data.deleted_count,
    },
    severity: SEVERITY.INFO,
  }).catch(() => {});
}

/**
 * Force flush all queued events (call on shutdown)
 */
export async function shutdown(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushQueue();
}

/**
 * Get current queue size (for testing/monitoring)
 */
export function getQueueSize(): number {
  return eventQueue.length;
}
