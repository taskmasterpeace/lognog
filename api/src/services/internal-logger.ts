/**
 * Internal Logger Service
 *
 * LogNog logs its own operational events to ClickHouse for searchability via DSL.
 * Events are tagged with app_name='lognog-internal' and hostname='lognog-api'.
 *
 * Query examples:
 *   search app_name="lognog-internal" | stats avg(duration_ms) by path
 *   search app_name="lognog-internal" severity<=3 | table timestamp message
 *   search app_name="lognog-internal" type="ai_request" | stats count by provider
 */

import { insertLogs, isLiteMode } from '../db/backend.js';

// Event types for self-monitoring
export type InternalEventType =
  | 'api_call'      // HTTP request/response
  | 'query'         // DSL query execution
  | 'error'         // Errors and exceptions
  | 'ingest'        // Log ingestion stats
  | 'ai_request';   // AI provider usage (Ollama/OpenRouter)

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
  type: InternalEventType;
  data: Record<string, unknown>;
  severity?: number;
}

// Check if self-monitoring is enabled
function isEnabled(): boolean {
  const enabled = process.env.LOGNOG_SELF_MONITORING;
  // Default to true unless explicitly disabled
  return enabled !== 'false' && enabled !== '0';
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
 * @param event - The event to log
 * @returns Promise that resolves when event is queued
 */
export async function logInternalEvent(event: InternalEvent): Promise<void> {
  if (!isEnabled()) return;

  const timestamp = new Date();
  const severity = event.severity ?? SEVERITY.INFO;

  // Build the log entry matching ClickHouse schema
  // Note: ClickHouse DateTime64 doesn't accept 'Z' suffix, need space-separated format
  const ts = timestamp.toISOString().replace('T', ' ').replace('Z', '');
  const logEntry: Record<string, unknown> = {
    timestamp: ts,
    received_at: ts,
    severity,
    facility: 1, // user-level
    priority: (1 * 8) + severity, // facility * 8 + severity
    hostname: 'lognog-api',
    app_name: 'lognog-internal',
    proc_id: String(process.pid),
    msg_id: event.type,
    message: JSON.stringify({
      type: event.type,
      ...event.data,
    }),
    structured_data: JSON.stringify(event.data),
    index_name: 'lognog-internal',
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
  const severity = data.status >= 500 ? SEVERITY.ERROR :
                   data.status >= 400 ? SEVERITY.WARNING :
                   SEVERITY.INFO;

  // Create human-readable description
  const statusText = data.status >= 500 ? 'Server error' :
                     data.status >= 400 ? 'Client error' :
                     data.status >= 300 ? 'Redirect' :
                     'OK';

  const slowWarning = data.duration_ms >= 1000 ? ' (SLOW)' : '';

  logInternalEvent({
    type: 'api_call',
    data: {
      ...data,
      description: `${data.method} ${data.path} -> ${data.status} ${statusText}${slowWarning}`,
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
  const severity = data.error ? SEVERITY.ERROR : SEVERITY.INFO;

  // Truncate long queries for readability
  const shortQuery = data.dsl_query.length > 80
    ? data.dsl_query.substring(0, 77) + '...'
    : data.dsl_query;

  const slowWarning = data.execution_time_ms >= 1000 ? ' (SLOW)' : '';
  const resultInfo = data.error
    ? `Error: ${data.error}`
    : `${data.row_count} rows in ${data.execution_time_ms}ms${slowWarning}`;

  logInternalEvent({
    type: 'query',
    data: {
      ...data,
      description: `Query: ${shortQuery} -> ${resultInfo}`,
    },
    severity,
  }).catch(() => {});
}

/**
 * Log an error
 */
export function logError(data: {
  error_type: string;
  message: string;
  stack_trace?: string;
  endpoint?: string;
  user_id?: string;
}): void {
  logInternalEvent({
    type: 'error',
    data,
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
}): void {
  const indexInfo = data.index_name ? ` to index=${data.index_name}` : '';
  const appInfo = data.app_name ? ` from app=${data.app_name}` : '';

  logInternalEvent({
    type: 'ingest',
    data: {
      ...data,
      description: `Ingested ${data.event_count} events via ${data.source_type}${indexInfo}${appInfo} (${data.duration_ms}ms)`,
    },
    severity: SEVERITY.INFO,
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
  const severity = data.success ? SEVERITY.INFO : SEVERITY.WARNING;

  logInternalEvent({
    type: 'ai_request',
    data,
    severity,
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
