import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, authenticateIngestion } from '../auth/middleware.js';
import { logAuthEvent } from '../auth/auth.js';
import { insertLogs, getBackendInfo } from '../db/backend.js';
import { getPendingNotifications, markNotificationDelivered, AgentNotification } from '../db/sqlite.js';
import { logIngestionStats } from '../services/internal-logger.js';

const router = Router();

/**
 * Sanitize index name to prevent injection and ensure valid ClickHouse table naming.
 * Only allows alphanumeric characters, hyphens, and underscores.
 * Converts to lowercase and limits length.
 */
function sanitizeIndexName(name: string, defaultValue: string = 'http'): string {
  if (!name || typeof name !== 'string') return defaultValue;

  // Remove any characters that aren't alphanumeric, hyphen, or underscore
  const sanitized = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32); // Limit length

  // Must start with a letter
  if (!/^[a-z]/.test(sanitized)) {
    return defaultValue;
  }

  return sanitized || defaultValue;
}

/**
 * Sanitize app name for display and storage.
 * More permissive than index name, but still safe.
 */
function sanitizeAppName(name: string, defaultValue: string = 'generic'): string {
  if (!name || typeof name !== 'string') return defaultValue;

  // Remove control characters and limit length
  const sanitized = name
    .trim()
    .replace(/[\x00-\x1f\x7f]/g, '') // Remove control characters
    .slice(0, 64); // Limit length

  return sanitized || defaultValue;
}

// Event schema from LogNog In agent
const agentEventSchema = z.object({
  type: z.enum(['log', 'fim']),
  timestamp: z.string(),
  hostname: z.string(),
  source: z.string(),
  source_type: z.string(),
  file_path: z.string().optional(),
  message: z.string().optional(),
  // FIM-specific fields
  event_type: z.string().optional(),
  previous_hash: z.string().nullable().optional(),
  current_hash: z.string().nullable().optional(),
  file_owner: z.string().nullable().optional(),
  file_permissions: z.string().nullable().optional(),
  // Metadata
  metadata: z.record(z.unknown()).optional(),
});

const ingestRequestSchema = z.object({
  events: z.array(agentEventSchema).min(1).max(10000),
});

/**
 * POST /api/ingest/agent
 *
 * Receive events from LogNog In agents.
 * Requires API key authentication with 'write' permission.
 */
router.post(
  '/agent',
  authenticate,
  requirePermission('write'),
  async (req, res) => {
    try {
      const { events } = ingestRequestSchema.parse(req.body);

      // Transform events for storage
      const logs = events.map((event) => {
        const baseLog = {
          timestamp: event.timestamp,
          received_at: new Date().toISOString(),
          hostname: event.hostname,
          app_name: event.source,
          message: event.message || '',
          raw: JSON.stringify(event),
          structured_data: JSON.stringify(event.metadata || {}),
          // Set index based on event type
          index_name: event.type === 'fim' ? 'security' : 'agent',
        };

        if (event.type === 'fim') {
          // FIM events get special handling
          return {
            ...baseLog,
            message: `FIM ${event.event_type}: ${event.file_path}`,
            // Add FIM-specific structured data
            structured_data: JSON.stringify({
              fim_event_type: event.event_type,
              file_path: event.file_path,
              previous_hash: event.previous_hash,
              current_hash: event.current_hash,
              file_owner: event.file_owner,
              file_permissions: event.file_permissions,
              ...event.metadata,
            }),
            // FIM events are typically warnings or higher
            severity: event.event_type === 'deleted' ? 4 : 5, // warning or notice
          };
        }

        return {
          ...baseLog,
          // Log events use file path info
          structured_data: JSON.stringify({
            file_path: event.file_path,
            source_type: event.source_type,
            ...event.metadata,
          }),
          severity: 6, // informational
        };
      });

      // Insert into database
      const ingestStart = Date.now();
      await insertLogs(logs);
      const ingestDuration = Date.now() - ingestStart;

      // Log the ingestion stats for self-monitoring
      logIngestionStats({
        source_type: 'agent',
        event_count: events.length,
        batch_size: events.length,
        duration_ms: ingestDuration,
        user_id: req.user?.id,
      });

      // Log the auth event
      logAuthEvent(req.user!.id, 'agent_ingest', req.ip, req.get('user-agent'), {
        events_count: events.length,
        hostname: events[0]?.hostname,
      });

      res.json({
        accepted: events.length,
        rejected: 0,
        errors: [],
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors,
          accepted: 0,
          rejected: 0,
        });
        return;
      }

      console.error('Ingest error:', error);
      res.status(500).json({
        error: 'Ingestion failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        accepted: 0,
        rejected: 0,
      });
    }
  }
);

/**
 * GET /api/ingest/health
 *
 * Health check for agents.
 */
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// Agent Notifications
// =============================================================================

/**
 * GET /api/ingest/notifications
 *
 * Get pending notifications for the agent.
 * Requires API key authentication.
 * Optionally pass ?hostname=xxx to filter by hostname.
 */
router.get(
  '/notifications',
  authenticate,
  async (req, res) => {
    try {
      const hostname = req.query.hostname as string | undefined;
      const notifications = getPendingNotifications(hostname);

      res.json({
        notifications: notifications.map((n: AgentNotification) => ({
          id: n.id,
          alert_name: n.alert_name,
          severity: n.severity,
          title: n.title,
          message: n.message,
          created_at: n.created_at,
        })),
        count: notifications.length,
      });
    } catch (error) {
      console.error('Get notifications error:', error);
      res.status(500).json({
        error: 'Failed to get notifications',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/ingest/notifications/:id/ack
 *
 * Acknowledge (mark as delivered) a notification.
 * Requires API key authentication.
 */
router.post(
  '/notifications/:id/ack',
  authenticate,
  async (req, res) => {
    try {
      const { id } = req.params;
      const hostname = req.body.hostname as string | undefined;

      const success = markNotificationDelivered(id, hostname);

      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Notification not found' });
      }
    } catch (error) {
      console.error('Ack notification error:', error);
      res.status(500).json({
        error: 'Failed to acknowledge notification',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// =============================================================================
// OpenTelemetry (OTLP) Ingestion
// =============================================================================

// OTLP severity levels (https://opentelemetry.io/docs/specs/otel/logs/data-model/#severity-fields)
// 1-4: TRACE, 5-8: DEBUG, 9-12: INFO, 13-16: WARN, 17-20: ERROR, 21-24: FATAL
function otlpSeverityToSyslog(severityNumber: number): number {
  if (severityNumber >= 21) return 2; // FATAL -> critical
  if (severityNumber >= 17) return 3; // ERROR -> error
  if (severityNumber >= 13) return 4; // WARN -> warning
  if (severityNumber >= 9) return 6;  // INFO -> informational
  if (severityNumber >= 5) return 7;  // DEBUG -> debug
  return 7; // TRACE -> debug
}

// Helper to extract value from OTLP AnyValue
function extractOtlpValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;

  const v = value as Record<string, unknown>;
  if ('stringValue' in v) return v.stringValue;
  if ('intValue' in v) return Number(v.intValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('boolValue' in v) return v.boolValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('arrayValue' in v) {
    const arr = v.arrayValue as { values?: unknown[] };
    return (arr.values || []).map(extractOtlpValue);
  }
  if ('kvlistValue' in v) {
    const kvlist = v.kvlistValue as { values?: Array<{ key: string; value: unknown }> };
    const obj: Record<string, unknown> = {};
    for (const kv of kvlist.values || []) {
      obj[kv.key] = extractOtlpValue(kv.value);
    }
    return obj;
  }
  return v;
}

// Extract attributes to a plain object
function extractAttributes(attrs: Array<{ key: string; value: unknown }> | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!attrs) return result;

  for (const attr of attrs) {
    result[attr.key] = extractOtlpValue(attr.value);
  }
  return result;
}

/**
 * POST /api/ingest/otlp/v1/logs
 *
 * Receive logs in OTLP/HTTP JSON format.
 * Compatible with OpenTelemetry collectors and SDKs.
 *
 * Authentication:
 * - Requires API key with 'write' permission (unless OTLP_REQUIRE_AUTH=false)
 * - Supports Authorization: Bearer <api-key>
 * - Supports Authorization: ApiKey <api-key>
 * - Supports X-API-Key: <api-key>
 */
router.post('/otlp/v1/logs', authenticateIngestion, async (req, res) => {
  try {
    const body = req.body;

    if (!body.resourceLogs || !Array.isArray(body.resourceLogs)) {
      return res.status(400).json({
        error: 'Invalid OTLP format',
        message: 'Expected resourceLogs array',
      });
    }

    const logs: Array<{
      timestamp: string;
      received_at: string;
      hostname: string;
      app_name: string;
      message: string;
      severity: number;
      raw: string;
      structured_data: string;
      index_name: string;
    }> = [];

    const receivedAt = new Date().toISOString();

    for (const resourceLog of body.resourceLogs) {
      // Extract resource attributes (service.name, host.name, etc.)
      const resourceAttrs = extractAttributes(resourceLog.resource?.attributes);
      const serviceName = (resourceAttrs['service.name'] as string) || 'unknown';
      const hostName = (resourceAttrs['host.name'] as string) ||
                       (resourceAttrs['host.hostname'] as string) ||
                       'unknown';

      for (const scopeLog of resourceLog.scopeLogs || []) {
        const scopeName = scopeLog.scope?.name || '';

        for (const logRecord of scopeLog.logRecords || []) {
          // Parse timestamp (nanoseconds since epoch)
          let timestamp: string;
          if (logRecord.timeUnixNano) {
            const ms = Number(BigInt(logRecord.timeUnixNano) / BigInt(1000000));
            timestamp = new Date(ms).toISOString();
          } else if (logRecord.observedTimeUnixNano) {
            const ms = Number(BigInt(logRecord.observedTimeUnixNano) / BigInt(1000000));
            timestamp = new Date(ms).toISOString();
          } else {
            timestamp = receivedAt;
          }

          // Extract body
          let message = '';
          if (logRecord.body) {
            const bodyValue = extractOtlpValue(logRecord.body);
            message = typeof bodyValue === 'string' ? bodyValue : JSON.stringify(bodyValue);
          }

          // Extract attributes
          const logAttrs = extractAttributes(logRecord.attributes);

          // Map severity
          const severity = otlpSeverityToSyslog(logRecord.severityNumber || 9);

          logs.push({
            timestamp,
            received_at: receivedAt,
            hostname: hostName,
            app_name: serviceName,
            message,
            severity,
            raw: JSON.stringify(logRecord),
            structured_data: JSON.stringify({
              ...resourceAttrs,
              ...logAttrs,
              otel_scope: scopeName,
              otel_severity_text: logRecord.severityText,
              otel_trace_id: logRecord.traceId,
              otel_span_id: logRecord.spanId,
            }),
            index_name: 'otel',
          });
        }
      }
    }

    if (logs.length === 0) {
      return res.status(200).json({ accepted: 0 });
    }

    // Insert into database
    const ingestStart = Date.now();
    await insertLogs(logs);
    const ingestDuration = Date.now() - ingestStart;

    // Log the ingestion stats for self-monitoring
    logIngestionStats({
      source_type: 'otlp',
      event_count: logs.length,
      batch_size: logs.length,
      duration_ms: ingestDuration,
      user_id: req.user?.id,
    });

    console.log(`OTLP: Ingested ${logs.length} log records`);

    // Log ingestion event if authenticated
    if (req.user) {
      logAuthEvent(req.user.id, 'otlp_ingest', req.ip, req.get('user-agent'), {
        logs_count: logs.length,
      });
    }

    // OTLP expects empty response on success
    res.status(200).json({ accepted: logs.length });
  } catch (error) {
    console.error('OTLP ingest error:', error);
    res.status(500).json({
      error: 'OTLP ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Supabase Log Drains
// =============================================================================

/**
 * Supabase Log Drain event structure.
 * Supabase sends logs from: database, auth, storage, realtime, edge functions
 */
interface SupabaseLogEvent {
  id?: string;
  timestamp: number; // Unix milliseconds
  event_message: string;
  metadata: {
    project?: string;
    // Database logs
    parsed?: {
      user_name?: string;
      database_name?: string;
      process_id?: number;
      error_severity?: string;
      session_id?: string;
      session_line_num?: number;
      command_tag?: string;
      session_start_time?: string;
      virtual_transaction_id?: string;
      transaction_id?: number;
      sql_state_code?: string;
      application_name?: string;
    };
    // Auth logs
    level?: string;
    component?: string;
    method?: string;
    path?: string;
    status?: number;
    // Edge function logs
    function_id?: string;
    execution_id?: string;
    deployment_id?: string;
    version?: string;
    // Common
    host?: string;
    [key: string]: unknown;
  };
}

/**
 * Map Supabase log level to syslog severity
 */
function supabaseLogLevelToSeverity(level?: string, errorSeverity?: string): number {
  // Database error severity
  if (errorSeverity) {
    const sev = errorSeverity.toUpperCase();
    if (sev === 'FATAL' || sev === 'PANIC') return 2;  // critical
    if (sev === 'ERROR') return 3;                      // error
    if (sev === 'WARNING') return 4;                    // warning
    if (sev === 'NOTICE') return 5;                     // notice
    if (sev === 'LOG' || sev === 'INFO') return 6;     // info
    if (sev === 'DEBUG') return 7;                      // debug
  }

  // General log level
  if (level) {
    const lvl = level.toLowerCase();
    if (lvl === 'fatal' || lvl === 'panic' || lvl === 'critical') return 2;
    if (lvl === 'error' || lvl === 'err') return 3;
    if (lvl === 'warn' || lvl === 'warning') return 4;
    if (lvl === 'notice') return 5;
    if (lvl === 'info' || lvl === 'log') return 6;
    if (lvl === 'debug' || lvl === 'trace') return 7;
  }

  return 6; // default to info
}

/**
 * Determine Supabase component from log metadata
 */
function getSupabaseComponent(metadata: SupabaseLogEvent['metadata']): string {
  if (metadata.function_id) return 'edge-functions';
  if (metadata.parsed?.database_name) return 'postgres';
  if (metadata.component === 'auth' || metadata.path?.includes('/auth')) return 'auth';
  if (metadata.path?.includes('/storage')) return 'storage';
  if (metadata.path?.includes('/realtime')) return 'realtime';
  if (metadata.component) return metadata.component;
  return 'supabase';
}

/**
 * POST /api/ingest/supabase
 *
 * Receive logs from Supabase Log Drains.
 * Supabase sends batched logs (up to 250 per request).
 *
 * Setup in Supabase:
 * 1. Dashboard → Settings → Log Drains
 * 2. Add destination: Generic HTTP endpoint
 * 3. URL: https://your-lognog-server/api/ingest/supabase
 * 4. Headers: X-API-Key: <your-api-key>
 *
 * Authentication:
 * - X-API-Key header (recommended)
 * - Authorization: Bearer <api-key>
 * - Authorization: ApiKey <api-key>
 */
router.post('/supabase', authenticateIngestion, async (req, res) => {
  try {
    const body = req.body;

    // Supabase sends an array of log events
    if (!Array.isArray(body)) {
      return res.status(400).json({
        error: 'Invalid Supabase Log Drains format',
        message: 'Expected array of log events',
      });
    }

    const events = body as SupabaseLogEvent[];
    const receivedAt = new Date().toISOString();

    const logs = events.map((event) => {
      const metadata = event.metadata || {};

      // Parse timestamp
      let timestamp: string;
      if (event.timestamp) {
        timestamp = new Date(event.timestamp).toISOString();
      } else {
        timestamp = receivedAt;
      }

      // Determine component and severity
      const component = getSupabaseComponent(metadata);
      const severity = supabaseLogLevelToSeverity(
        metadata.level,
        metadata.parsed?.error_severity
      );

      // Build hostname from project or host
      const hostname = metadata.project || metadata.host || 'supabase';

      // Build app_name from component
      const appName = `supabase-${component}`;

      // Extract structured data
      const structuredData: Record<string, unknown> = {
        supabase_component: component,
        supabase_project: metadata.project,
      };

      // Add database-specific fields
      if (metadata.parsed) {
        Object.assign(structuredData, {
          db_user: metadata.parsed.user_name,
          db_name: metadata.parsed.database_name,
          db_pid: metadata.parsed.process_id,
          db_session_id: metadata.parsed.session_id,
          db_command: metadata.parsed.command_tag,
          db_application: metadata.parsed.application_name,
          sql_state: metadata.parsed.sql_state_code,
        });
      }

      // Add edge function fields
      if (metadata.function_id) {
        Object.assign(structuredData, {
          function_id: metadata.function_id,
          execution_id: metadata.execution_id,
          deployment_id: metadata.deployment_id,
          function_version: metadata.version,
        });
      }

      // Add HTTP request fields
      if (metadata.method || metadata.path) {
        Object.assign(structuredData, {
          http_method: metadata.method,
          http_path: metadata.path,
          http_status: metadata.status,
        });
      }

      return {
        timestamp,
        received_at: receivedAt,
        hostname,
        app_name: appName,
        message: event.event_message || '',
        severity,
        raw: JSON.stringify(event),
        structured_data: JSON.stringify(structuredData),
        index_name: 'supabase',
        protocol: 'supabase-log-drain',
      };
    });

    if (logs.length === 0) {
      return res.status(200).json({ accepted: 0 });
    }

    // Insert into database
    await insertLogs(logs);

    console.log(`Supabase: Ingested ${logs.length} log events`);

    // Log ingestion event if authenticated
    if (req.user) {
      logAuthEvent(req.user.id, 'supabase_ingest', req.ip, req.get('user-agent'), {
        logs_count: logs.length,
        project: events[0]?.metadata?.project,
      });
    }

    // Supabase expects 200 OK on success
    res.status(200).json({
      accepted: logs.length,
      message: 'Logs ingested successfully',
    });
  } catch (error) {
    console.error('Supabase ingest error:', error);
    res.status(500).json({
      error: 'Supabase log ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/ingest/http
 *
 * Generic HTTP log ingestion endpoint.
 * Accepts a JSON array of log objects with flexible schema.
 *
 * Custom Headers:
 * - X-Index: Custom index name (alphanumeric, hyphens only, max 32 chars)
 * - X-App-Name: Custom app name to override auto-detection
 * - X-Source-Name: Alias for X-App-Name
 *
 * Authentication: API key required
 */
router.post('/http', authenticateIngestion, async (req, res) => {
  try {
    const body = req.body;

    // Accept array of logs
    if (!Array.isArray(body)) {
      return res.status(400).json({
        error: 'Invalid format',
        message: 'Expected array of log objects',
      });
    }

    // Extract custom headers for index and app name
    const customIndex = sanitizeIndexName(req.headers['x-index'] as string, 'http');
    const customAppName = req.headers['x-app-name'] as string || req.headers['x-source-name'] as string;

    const receivedAt = new Date().toISOString();

    const logs = body.map((event: Record<string, unknown>) => {
      // Try to extract timestamp from various common field names
      let timestamp = receivedAt;
      const tsField = event.timestamp || event.time || event['@timestamp'] || event.ts || event.datetime;
      if (tsField) {
        if (typeof tsField === 'number') {
          // Unix timestamp (seconds or milliseconds)
          timestamp = new Date(tsField > 1e12 ? tsField : tsField * 1000).toISOString();
        } else if (typeof tsField === 'string') {
          timestamp = new Date(tsField).toISOString();
        }
      }

      // Extract common fields - use custom app name if provided via header
      const hostname = String(event.hostname || event.host || event.source || 'unknown');
      const appNameFromEvent = String(event.app_name || event.app || event.application || event.program || event.service || '');
      const appName = sanitizeAppName(customAppName || appNameFromEvent, 'generic');
      const message = String(event.message || event.msg || event.log || event.text || JSON.stringify(event));

      // Try to determine severity
      let severity = 6; // default info
      const levelField = event.level || event.severity || event.loglevel;
      if (levelField) {
        if (typeof levelField === 'number') {
          severity = Math.min(7, Math.max(0, levelField));
        } else {
          const lvl = String(levelField).toLowerCase();
          if (lvl.includes('fatal') || lvl.includes('crit')) severity = 2;
          else if (lvl.includes('error') || lvl.includes('err')) severity = 3;
          else if (lvl.includes('warn')) severity = 4;
          else if (lvl.includes('notice')) severity = 5;
          else if (lvl.includes('info')) severity = 6;
          else if (lvl.includes('debug') || lvl.includes('trace')) severity = 7;
        }
      }

      return {
        timestamp,
        received_at: receivedAt,
        hostname,
        app_name: appName,
        message,
        severity,
        raw: JSON.stringify(event),
        structured_data: JSON.stringify(event),
        index_name: customIndex,
        protocol: 'http',
      };
    });

    if (logs.length === 0) {
      return res.status(200).json({ accepted: 0 });
    }

    const ingestStart = Date.now();
    await insertLogs(logs);
    const ingestDuration = Date.now() - ingestStart;

    // Log the ingestion stats for self-monitoring
    logIngestionStats({
      source_type: 'http',
      event_count: logs.length,
      batch_size: logs.length,
      duration_ms: ingestDuration,
      user_id: req.user?.id,
    });

    console.log(`HTTP: Ingested ${logs.length} log events to index '${customIndex}'`);

    if (req.user) {
      logAuthEvent(req.user.id, 'http_ingest', req.ip, req.get('user-agent'), {
        logs_count: logs.length,
        index_name: customIndex,
      });
    }

    res.status(200).json({
      accepted: logs.length,
      index: customIndex,
    });
  } catch (error) {
    console.error('HTTP ingest error:', error);
    res.status(500).json({
      error: 'HTTP log ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Vercel Log Drains
// =============================================================================

/**
 * Vercel Log Drain event structure.
 * Vercel sends logs in JSON, NDJSON, or syslog format.
 * We support JSON format here.
 *
 * Log types:
 * - stdout/stderr: Application logs
 * - request: Edge/Serverless function requests
 * - static: Static file requests
 * - build: Build logs
 */
interface VercelLogEvent {
  id?: string;
  message: string;
  timestamp: number; // Unix milliseconds
  type?: 'stdout' | 'stderr' | 'request' | 'static' | 'build';
  source?: 'static' | 'lambda' | 'edge' | 'build' | 'external';
  projectId?: string;
  projectName?: string;
  deploymentId?: string;
  deploymentUrl?: string;
  host?: string;
  path?: string;
  entrypoint?: string;
  requestId?: string;
  statusCode?: number;
  // Request-specific fields
  proxy?: {
    timestamp: number;
    method: string;
    scheme: string;
    host: string;
    path: string;
    userAgent: string[];
    referer: string;
    statusCode: number;
    clientIp: string;
    region: string;
    cacheId?: string;
    vercelCache?: string;
  };
  // Build-specific fields
  buildId?: string;
  // Lambda/Edge function fields
  level?: 'info' | 'warn' | 'error' | 'debug';
  environment?: string;
}

/**
 * Map Vercel log type/level to syslog severity
 */
function vercelLogToSeverity(event: VercelLogEvent): number {
  // Check explicit level first
  if (event.level) {
    switch (event.level) {
      case 'error': return 3;
      case 'warn': return 4;
      case 'info': return 6;
      case 'debug': return 7;
    }
  }

  // Check type
  if (event.type === 'stderr') return 3; // error
  if (event.type === 'build') return 5;  // notice

  // Check status code for requests
  if (event.statusCode || event.proxy?.statusCode) {
    const status = event.statusCode || event.proxy?.statusCode || 200;
    if (status >= 500) return 3; // error
    if (status >= 400) return 4; // warning
  }

  return 6; // default info
}

/**
 * Determine Vercel source component
 */
function getVercelComponent(event: VercelLogEvent): string {
  if (event.source === 'edge') return 'edge';
  if (event.source === 'lambda') return 'serverless';
  if (event.source === 'static') return 'static';
  if (event.source === 'build') return 'build';
  if (event.type === 'request') return 'request';
  if (event.type === 'build') return 'build';
  return 'runtime';
}

/**
 * POST /api/ingest/vercel
 *
 * Receive logs from Vercel Log Drains.
 *
 * Setup in Vercel:
 * 1. Dashboard → Team Settings → Drains
 * 2. Add Drain → Custom HTTP endpoint
 * 3. URL: https://your-lognog-server/api/ingest/vercel
 * 4. Format: JSON
 * 5. Headers: X-API-Key: <your-api-key>
 *
 * Note: Vercel requires Pro or Enterprise plan for Log Drains.
 *
 * Authentication:
 * - X-API-Key header (recommended)
 * - Authorization: Bearer <api-key>
 * - x-vercel-verify header (for Vercel's verification)
 */
router.post('/vercel', authenticateIngestion, async (req, res) => {
  try {
    const body = req.body;
    const receivedAt = new Date().toISOString();

    // Handle Vercel's verification request
    if (req.headers['x-vercel-verify']) {
      return res.status(200).send(req.headers['x-vercel-verify']);
    }

    // Vercel can send single object or array
    const events: VercelLogEvent[] = Array.isArray(body) ? body : [body];

    if (events.length === 0) {
      return res.status(200).json({ accepted: 0 });
    }

    const logs = events.map((event) => {
      // Parse timestamp
      let timestamp: string;
      if (event.timestamp) {
        timestamp = new Date(event.timestamp).toISOString();
      } else if (event.proxy?.timestamp) {
        timestamp = new Date(event.proxy.timestamp).toISOString();
      } else {
        timestamp = receivedAt;
      }

      // Determine severity and component
      const severity = vercelLogToSeverity(event);
      const component = getVercelComponent(event);

      // Build hostname from project name or deployment URL
      const hostname = event.projectName || event.host || event.deploymentUrl || 'vercel';

      // Build app_name
      const appName = `vercel-${component}`;

      // Build message
      let message = event.message || '';
      if (event.proxy && !message) {
        message = `${event.proxy.method} ${event.proxy.path} ${event.proxy.statusCode}`;
      }

      // Extract structured data
      const structuredData: Record<string, unknown> = {
        vercel_component: component,
        vercel_project: event.projectName,
        vercel_deployment: event.deploymentId,
        vercel_type: event.type,
        vercel_source: event.source,
      };

      // Add request-specific fields
      if (event.proxy) {
        Object.assign(structuredData, {
          http_method: event.proxy.method,
          http_path: event.proxy.path,
          http_status: event.proxy.statusCode,
          http_scheme: event.proxy.scheme,
          client_ip: event.proxy.clientIp,
          user_agent: event.proxy.userAgent?.join(' '),
          vercel_region: event.proxy.region,
          vercel_cache: event.proxy.vercelCache,
        });
      }

      // Add lambda/edge fields
      if (event.entrypoint) {
        structuredData.entrypoint = event.entrypoint;
      }
      if (event.requestId) {
        structuredData.request_id = event.requestId;
      }
      if (event.environment) {
        structuredData.environment = event.environment;
      }

      // Add build fields
      if (event.buildId) {
        structuredData.build_id = event.buildId;
      }

      return {
        timestamp,
        received_at: receivedAt,
        hostname,
        app_name: appName,
        message,
        severity,
        raw: JSON.stringify(event),
        structured_data: JSON.stringify(structuredData),
        index_name: 'vercel',
        protocol: 'vercel-log-drain',
      };
    });

    // Insert into database
    await insertLogs(logs);

    console.log(`Vercel: Ingested ${logs.length} log events`);

    // Log ingestion event if authenticated
    if (req.user) {
      logAuthEvent(req.user.id, 'vercel_ingest', req.ip, req.get('user-agent'), {
        logs_count: logs.length,
        project: events[0]?.projectName,
      });
    }

    // Vercel expects 200 OK on success
    res.status(200).json({
      accepted: logs.length,
      message: 'Logs ingested successfully',
    });
  } catch (error) {
    console.error('Vercel ingest error:', error);
    res.status(500).json({
      error: 'Vercel log ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Next.js Application Logs
// =============================================================================

// Supports both nested format (original) and flat format (DP style)
interface NextJsLogEvent {
  timestamp?: number | string;
  type: 'api' | 'action' | 'performance' | 'error' | 'integration' | 'business';
  environment?: 'development' | 'production' | 'preview';
  deployment_id?: string;
  user_id?: string;
  user_email?: string;
  session_id?: string;
  message?: string; // Optional pre-formatted message
  // Flat format fields (DP style)
  route?: string;
  method?: string;
  status_code?: number;
  duration_ms?: number;
  integration?: string;
  latency_ms?: number;
  success?: boolean;
  error?: string;
  name?: string;
  component?: string;
  page?: string;
  metric?: string;
  value?: number;
  event?: string;
  amount?: number;
  currency?: string;
  // Business event fields (credits, AI usage, etc.)
  credits_deducted?: number;
  credits_before?: number;
  credits_after?: number;
  credits_used?: number;
  model?: string;
  prediction_id?: string;
  generation_id?: string;
  reason?: string;
  prompt_preview?: string;
  prompt_length?: number;
  tokens_used?: number;
  estimated_cost?: number;
  output_url?: string;
  // Integration fields
  http_status?: number;
  error_code?: string;
  // Recipe/Storybook fields
  recipe_id?: string;
  recipe_name?: string;
  stage_count?: number;
  project_id?: string;
  title?: string;
  category?: string;
  topic?: string;
  character_name?: string;
  character_age?: number;
  page_count?: number;
  sentences_per_page?: number;
  generated_title?: string;
  // Prompt expander fields
  detail_level?: string;
  director_style?: string;
  original_prompt_length?: number;
  expanded_prompt_length?: number;
  // Nested format fields (original)
  api?: {
    route: string;
    method: string;
    status_code: number;
    duration_ms: number;
    error?: string;
    request_id?: string;
    integration?: string;
    integration_latency_ms?: number;
  };
  action?: {
    name: string;
    component: string;
    page: string;
    metadata?: Record<string, unknown>;
  };
  performance?: {
    metric: string;
    value: number;
    page: string;
    device_type?: 'mobile' | 'tablet' | 'desktop';
  };
  errorDetails?: {
    message: string;
    stack?: string;
    component?: string;
    page?: string;
    user_agent?: string;
  };
  metadata?: Record<string, unknown>;
}

function nextjsLogToSeverity(event: NextJsLogEvent): number {
  // Get status code from flat or nested format
  const statusCode = event.status_code ?? event.api?.status_code;
  const durationMs = event.duration_ms ?? event.api?.duration_ms;
  const success = event.success;

  if (event.type === 'error') {
    if (statusCode && statusCode >= 500) return 2;
    if (event.error?.toLowerCase().includes('uncaught')) return 2;
    if (event.errorDetails?.message?.toLowerCase().includes('uncaught')) return 2;
    return 3;
  }
  if (event.type === 'api') {
    if (statusCode && statusCode >= 500) return 3;
    if (statusCode && statusCode >= 400) return 4;
    if (durationMs && durationMs > 5000) return 4;
  }
  if (event.type === 'integration') {
    if (success === false) return 3;
    const latency = event.latency_ms ?? event.api?.integration_latency_ms;
    if (latency && latency > 10000) return 4;
  }
  if (event.type === 'performance') {
    const metric = event.metric ?? event.performance?.metric;
    const value = event.value ?? event.performance?.value;
    if (metric && value !== undefined) {
      if (metric === 'LCP' && value > 2500) return 4;
      if (metric === 'FID' && value > 100) return 4;
      if (metric === 'CLS' && value > 0.1) return 4;
      if (metric === 'TTFB' && value > 800) return 4;
    }
  }
  return 6;
}

function extractNextJsStructuredData(event: NextJsLogEvent): Record<string, unknown> {
  const data: Record<string, unknown> = {
    nextjs_type: event.type,
    nextjs_environment: event.environment,
    deployment_id: event.deployment_id,
    user_id: event.user_id,
    session_id: event.session_id,
  };

  // Handle API type (flat or nested)
  if (event.type === 'api') {
    Object.assign(data, {
      http_method: event.method ?? event.api?.method,
      http_route: event.route ?? event.api?.route,
      http_status: event.status_code ?? event.api?.status_code,
      api_duration_ms: event.duration_ms ?? event.api?.duration_ms,
      api_error: event.error ?? event.api?.error,
      integration_name: event.integration ?? event.api?.integration,
    });
  }

  // Handle integration type (flat format) - extract all integration fields
  if (event.type === 'integration') {
    Object.assign(data, {
      integration_name: event.integration,
      integration_latency_ms: event.latency_ms,
      integration_success: event.success,
      integration_error: event.error,
      integration_http_status: event.http_status,
      integration_error_code: event.error_code,
      // User context
      user_email: event.user_email,
      // AI model details
      model: event.model,
      prompt_length: event.prompt_length,
      prompt_preview: event.prompt_preview,
      prediction_id: event.prediction_id,
      output_url: event.output_url,
      estimated_cost: event.estimated_cost,
      tokens_used: event.tokens_used,
    });
  }

  // Handle business type (flat format) - extract all business fields
  if (event.type === 'business') {
    Object.assign(data, {
      business_event: event.event ?? event.name,
      business_amount: event.amount,
      business_currency: event.currency,
      // User context
      user_email: event.user_email,
      // Credit tracking
      credits_deducted: event.credits_deducted,
      credits_before: event.credits_before,
      credits_after: event.credits_after,
      credits_used: event.credits_used,
      // AI/Generation context
      model: event.model,
      prediction_id: event.prediction_id,
      generation_id: event.generation_id,
      reason: event.reason,
      prompt_preview: event.prompt_preview,
      prompt_length: event.prompt_length,
      tokens_used: event.tokens_used,
      estimated_cost: event.estimated_cost,
      output_url: event.output_url,
      // Recipe context
      recipe_id: event.recipe_id,
      recipe_name: event.recipe_name,
      stage_count: event.stage_count,
      // Storybook context
      project_id: event.project_id,
      title: event.title,
      category: event.category,
      topic: event.topic,
      character_name: event.character_name,
      character_age: event.character_age,
      page_count: event.page_count,
      sentences_per_page: event.sentences_per_page,
      generated_title: event.generated_title,
      // Prompt expander context
      detail_level: event.detail_level,
      director_style: event.director_style,
      original_prompt_length: event.original_prompt_length,
      expanded_prompt_length: event.expanded_prompt_length,
    });
  }

  // Handle action type (flat or nested)
  if (event.type === 'action') {
    Object.assign(data, {
      action_name: event.name ?? event.action?.name,
      action_component: event.component ?? event.action?.component,
      action_page: event.page ?? event.action?.page,
      action_metadata: event.action?.metadata ? JSON.stringify(event.action.metadata) : undefined,
    });
  }

  // Handle performance type (flat or nested)
  if (event.type === 'performance') {
    Object.assign(data, {
      perf_metric: event.metric ?? event.performance?.metric,
      perf_value: event.value ?? event.performance?.value,
      perf_page: event.page ?? event.performance?.page,
    });
  }

  // Handle error type (flat or nested)
  if (event.type === 'error') {
    Object.assign(data, {
      error_message: event.error ?? event.errorDetails?.message,
      error_stack: event.errorDetails?.stack,
      error_component: event.component ?? event.errorDetails?.component,
      error_page: event.page ?? event.errorDetails?.page,
    });
  }

  if (event.metadata) Object.assign(data, event.metadata);
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

router.post('/nextjs', authenticateIngestion, async (req, res) => {
  try {
    const body = req.body;
    // ClickHouse DateTime64 doesn't accept 'Z' suffix - strip it
    const receivedAt = new Date().toISOString().replace('Z', '');
    const events: NextJsLogEvent[] = Array.isArray(body) ? body : [body];
    if (events.length === 0) return res.status(200).json({ accepted: 0 });

    const logs = events.map((event) => {
      let timestamp: string;
      if (event.timestamp) {
        if (typeof event.timestamp === 'number') {
          timestamp = new Date(event.timestamp > 1e12 ? event.timestamp : event.timestamp * 1000).toISOString().replace('Z', '');
        } else {
          timestamp = new Date(event.timestamp).toISOString().replace('Z', '');
        }
      } else {
        timestamp = receivedAt;
      }

      const severity = nextjsLogToSeverity(event);
      const hostname = event.environment || 'nextjs';
      const appName = `nextjs-${event.type}`;

      // Use pre-formatted message if provided, otherwise generate one
      let message = event.message || '';
      if (!message) {
        // Handle API type (flat or nested)
        if (event.type === 'api') {
          const method = event.method ?? event.api?.method ?? 'UNKNOWN';
          const route = event.route ?? event.api?.route ?? '/unknown';
          const status = event.status_code ?? event.api?.status_code ?? 0;
          const duration = event.duration_ms ?? event.api?.duration_ms ?? 0;
          const integration = event.integration ?? event.api?.integration;
          message = `${method} ${route} ${status} (${duration}ms)`;
          if (integration) message += ` [${integration}]`;
          if (event.error) message += ` - ${event.error}`;
        }
        // Handle integration type (flat format)
        else if (event.type === 'integration') {
          const integration = event.integration ?? 'unknown';
          const status = event.success !== false ? 'OK' : 'FAILED';
          const latency = event.latency_ms ?? 0;
          message = `${integration} ${status} ${latency}ms`;
          if (event.error) message += ` - ${event.error}`;
        }
        // Handle business type (flat format)
        else if (event.type === 'business') {
          const eventName = event.event ?? event.name ?? 'unknown';
          message = `Business: ${eventName}`;
          if (event.amount !== undefined) {
            message += ` ${event.currency ?? 'USD'} ${event.amount}`;
          }
        }
        // Handle action type (flat or nested)
        else if (event.type === 'action') {
          const name = event.name ?? event.action?.name ?? 'unknown';
          const component = event.component ?? event.action?.component ?? 'unknown';
          const page = event.page ?? event.action?.page ?? '/';
          message = `Action: ${name} on ${component} (${page})`;
        }
        // Handle performance type (flat or nested)
        else if (event.type === 'performance') {
          const metric = event.metric ?? event.performance?.metric ?? 'unknown';
          const value = event.value ?? event.performance?.value ?? 0;
          const page = event.page ?? event.performance?.page ?? '/';
          message = `Performance: ${metric}=${value} (${page})`;
        }
        // Handle error type (flat or nested)
        else if (event.type === 'error') {
          const errorMsg = event.error ?? event.errorDetails?.message ?? 'Unknown error';
          const component = event.component ?? event.errorDetails?.component;
          message = `Error: ${errorMsg}`;
          if (component) message += ` in ${component}`;
        }
        else {
          message = `Next.js ${event.type} event`;
        }
      }

      return {
        timestamp,
        received_at: receivedAt,
        hostname,
        app_name: appName,
        message,
        severity,
        facility: 1,
        priority: (1 * 8) + severity,
        raw: JSON.stringify(event),
        structured_data: JSON.stringify(extractNextJsStructuredData(event)),
        index_name: 'nextjs',
        protocol: 'nextjs-logger',
      };
    });

    await insertLogs(logs);
    console.log(`Next.js: Ingested ${logs.length} log events`);

    if (req.user) {
      logAuthEvent(req.user.id, 'nextjs_ingest', req.ip, req.get('user-agent'), {
        logs_count: logs.length,
        environment: events[0]?.environment,
        types: [...new Set(events.map(e => e.type))],
      });
    }

    res.status(200).json({ accepted: logs.length, message: 'Logs ingested successfully' });
  } catch (error) {
    console.error('Next.js ingest error:', error);
    res.status(500).json({
      error: 'Next.js log ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Test Data Generation
// =============================================================================

const TEST_HOSTS = [
  'web-server-01', 'web-server-02', 'db-server-01', 'db-server-02',
  'firewall-01', 'router-01', 'nas-01', 'proxmox-01', 'k8s-node-01',
  'pihole-01', 'homeassistant', 'pfsense', 'unifi-controller'
];

const TEST_APPS = [
  'nginx', 'apache', 'postgres', 'mysql', 'redis', 'docker',
  'sshd', 'systemd', 'kernel', 'cron', 'sudo', 'ufw',
  'haproxy', 'prometheus', 'grafana', 'elasticsearch'
];

const TEST_MESSAGES = {
  info: [
    'Connection established from {ip}',
    'User {user} logged in successfully',
    'Service started successfully',
    'Health check passed',
    'Backup completed: {size}MB transferred',
    'Cache hit for key: user:{id}',
    'Request processed in {ms}ms',
    'Configuration reloaded',
    'Worker process spawned (PID {pid})',
    'SSL certificate valid for {days} more days',
  ],
  warning: [
    'High memory usage detected: {pct}%',
    'Disk space running low: {pct}% used',
    'Rate limit approaching for client {ip}',
    'Connection pool nearly exhausted',
    'Slow query detected: {ms}ms',
    'Certificate expires in {days} days',
    'Retry attempt {n} for operation',
    'Non-standard request from {ip}',
  ],
  error: [
    'Connection refused to upstream server',
    'Authentication failed for user {user}',
    'Database connection timeout',
    'Out of memory error',
    'Deadlock detected in transaction {id}',
    'SSL handshake failed',
    'Service unavailable',
    'Maximum connections reached',
  ],
  critical: [
    'CRITICAL: Possible intrusion attempt from {ip}',
    'CRITICAL: Disk failure detected on /dev/sda',
    'CRITICAL: Kernel panic - not syncing',
    'CRITICAL: Security violation detected',
    'CRITICAL: Ransomware signature detected',
    'CRITICAL: Unauthorized root access attempt',
  ],
  firewall: [
    '[UFW BLOCK] IN=eth0 SRC={src_ip} DST={dst_ip} PROTO=TCP DPT={port}',
    '[UFW ALLOW] IN=eth0 SRC={src_ip} DST={dst_ip} PROTO=TCP DPT={port}',
    'Block port scan from {ip}',
    'Deny incoming connection {src_ip}:{src_port} -> {dst_ip}:{dst_port}',
    'Allow established connection {src_ip} -> {dst_ip}',
    'Drop invalid packet from {ip}',
    'Rate limit triggered for {ip}',
    'GeoIP block: {country} ({ip})',
  ],
};

const MALICIOUS_IPS = [
  '185.234.219.1', '45.33.32.156', '91.121.87.10', '23.94.5.133',
  '194.26.29.102', '89.248.167.131', '141.98.10.60', '193.32.162.189'
];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomIP(): string {
  return `${randomInt(10, 192)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

function fillTemplate(template: string): string {
  return template
    .replace('{ip}', Math.random() > 0.3 ? randomIP() : randomChoice(MALICIOUS_IPS))
    .replace('{src_ip}', randomIP())
    .replace('{dst_ip}', `192.168.1.${randomInt(1, 254)}`)
    .replace('{port}', String(randomChoice([22, 80, 443, 3306, 5432, 6379, 8080, 8443])))
    .replace('{src_port}', String(randomInt(10000, 65000)))
    .replace('{dst_port}', String(randomChoice([22, 80, 443, 3306, 5432])))
    .replace('{user}', randomChoice(['admin', 'root', 'deploy', 'www-data', 'postgres']))
    .replace('{pct}', String(randomInt(75, 98)))
    .replace('{ms}', String(randomInt(100, 5000)))
    .replace('{size}', String(randomInt(100, 5000)))
    .replace('{id}', String(randomInt(10000, 99999)))
    .replace('{pid}', String(randomInt(1000, 50000)))
    .replace('{days}', String(randomInt(7, 365)))
    .replace('{n}', String(randomInt(1, 5)))
    .replace('{country}', randomChoice(['CN', 'RU', 'KP', 'IR']));
}

function generateTestLog(): Record<string, unknown> {
  const now = new Date();
  // Generate logs spread over last hour
  const timestamp = new Date(now.getTime() - randomInt(0, 3600000));

  // Weighted severity distribution
  const roll = Math.random();
  let severity: number;
  let messageType: keyof typeof TEST_MESSAGES;

  if (roll < 0.5) {
    severity = 6; // info
    messageType = 'info';
  } else if (roll < 0.7) {
    severity = 5; // notice
    messageType = 'info';
  } else if (roll < 0.85) {
    severity = 4; // warning
    messageType = 'warning';
  } else if (roll < 0.92) {
    severity = 3; // error
    messageType = 'error';
  } else if (roll < 0.97) {
    severity = 2; // critical
    messageType = 'critical';
  } else {
    // Firewall logs
    severity = randomChoice([4, 5, 6]);
    messageType = 'firewall';
  }

  const hostname = randomChoice(TEST_HOSTS);
  const app_name = messageType === 'firewall'
    ? randomChoice(['ufw', 'pfsense', 'iptables', 'firewalld'])
    : randomChoice(TEST_APPS);

  return {
    timestamp: timestamp.toISOString(),
    received_at: now.toISOString(),
    hostname,
    app_name,
    severity,
    facility: 1,
    priority: (1 * 8) + severity,
    message: fillTemplate(randomChoice(TEST_MESSAGES[messageType])),
    raw: '',
    structured_data: '{}',
    index_name: messageType === 'firewall' ? 'security' : 'main',
  };
}

/**
 * POST /api/ingest/generate-test-data
 *
 * Generate test log data for demos and screenshots.
 * Requires authentication.
 */
router.post('/generate-test-data', authenticate, async (req, res) => {
  try {
    const count = Math.min(parseInt(req.body.count) || 100, 1000);

    const logs = Array.from({ length: count }, generateTestLog);

    await insertLogs(logs);

    console.log(`Generated ${count} test logs`);

    res.json({
      success: true,
      generated: count,
      message: `Generated ${count} test log entries`,
    });
  } catch (error) {
    console.error('Test data generation error:', error);
    res.status(500).json({
      error: 'Failed to generate test data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// SmartThings Integration
// =============================================================================

/**
 * SmartThings Event Types
 */
interface SmartThingsEvent {
  eventTime: string;
  eventType: string;
  deviceEvent?: {
    deviceId: string;
    componentId: string;
    capability: string;
    attribute: string;
    value: unknown;
    unit?: string;
    stateChange?: boolean;
  };
  deviceLifecycleEvent?: {
    deviceId: string;
    lifecycle: string;
    locationId?: string;
    roomId?: string;
  };
  deviceHealthEvent?: {
    deviceId: string;
    status: string;
    reason?: string;
  };
  hubHealthEvent?: {
    hubId: string;
    status: string;
    reason?: string;
  };
}

interface SmartThingsWebhookPayload {
  messageType: 'EVENT' | 'CONFIRMATION' | 'PING';
  confirmationUrl?: string;
  challenge?: string;
  eventData?: {
    events: SmartThingsEvent[];
    installedApp?: {
      installedAppId: string;
      locationId: string;
    };
  };
}

/**
 * Map SmartThings event type to syslog severity
 */
function smartThingsEventToSeverity(event: SmartThingsEvent): number {
  if (event.deviceHealthEvent) {
    if (event.deviceHealthEvent.status === 'OFFLINE') return 4; // warning
    if (event.deviceHealthEvent.status === 'UNHEALTHY') return 3; // error
  }
  if (event.hubHealthEvent) {
    if (event.hubHealthEvent.status === 'OFFLINE') return 3; // error
    if (event.hubHealthEvent.status === 'UNHEALTHY') return 4; // warning
  }
  if (event.eventType === 'DEVICE_LIFECYCLE_EVENT') {
    return 5; // notice
  }
  return 6; // info for normal device events
}

/**
 * POST /api/ingest/smartthings
 *
 * Receive events from SmartThings SmartApps or Enterprise Eventing.
 * Handles:
 * - CONFIRMATION: Responds to sink verification challenge
 * - PING: Health check from SmartThings
 * - EVENT: Device events, lifecycle events, health events
 *
 * Headers:
 * - X-API-Key: <api-key> (for authentication)
 */
router.post('/smartthings', authenticateIngestion, async (req, res) => {
  try {
    const payload = req.body as SmartThingsWebhookPayload;
    const receivedAt = new Date().toISOString();

    // Handle sink verification (CONFIRMATION)
    if (payload.messageType === 'CONFIRMATION') {
      // SmartThings sends a confirmation URL to verify the endpoint
      if (payload.confirmationUrl) {
        try {
          await fetch(payload.confirmationUrl);
          console.log('SmartThings webhook confirmed');
        } catch (error) {
          console.error('Failed to confirm SmartThings webhook:', error);
        }
      }
      return res.status(200).json({ status: 'confirmed' });
    }

    // Handle ping/challenge (for sink verification)
    if (payload.messageType === 'PING' || payload.challenge) {
      return res.status(200).json({
        pingData: { challenge: payload.challenge },
      });
    }

    // Handle events
    if (payload.messageType !== 'EVENT' || !payload.eventData?.events) {
      return res.status(200).json({ status: 'ok', message: 'No events to process' });
    }

    const events = payload.eventData.events;
    const installedApp = payload.eventData.installedApp;

    const logs = events.map((event) => {
      const severity = smartThingsEventToSeverity(event);
      let hostname = 'smartthings';
      let appName = 'smartthings';
      let message = '';
      const structuredData: Record<string, unknown> = {
        smartthings_event_type: event.eventType,
        location_id: installedApp?.locationId,
        installed_app_id: installedApp?.installedAppId,
      };

      // Handle device events
      if (event.deviceEvent) {
        const de = event.deviceEvent;
        hostname = de.deviceId.substring(0, 12);
        appName = `smartthings-${de.capability}`;
        message = `${de.capability}.${de.attribute} = ${JSON.stringify(de.value)}${de.unit ? ` ${de.unit}` : ''}`;
        Object.assign(structuredData, {
          device_id: de.deviceId,
          component_id: de.componentId,
          capability: de.capability,
          attribute: de.attribute,
          value: de.value,
          unit: de.unit,
          state_change: de.stateChange,
        });
      }

      // Handle device lifecycle events
      if (event.deviceLifecycleEvent) {
        const dle = event.deviceLifecycleEvent;
        hostname = dle.deviceId.substring(0, 12);
        appName = 'smartthings-lifecycle';
        message = `Device lifecycle: ${dle.lifecycle}`;
        Object.assign(structuredData, {
          device_id: dle.deviceId,
          lifecycle: dle.lifecycle,
          room_id: dle.roomId,
        });
      }

      // Handle device health events
      if (event.deviceHealthEvent) {
        const dhe = event.deviceHealthEvent;
        hostname = dhe.deviceId.substring(0, 12);
        appName = 'smartthings-health';
        message = `Device health: ${dhe.status}${dhe.reason ? ` (${dhe.reason})` : ''}`;
        Object.assign(structuredData, {
          device_id: dhe.deviceId,
          health_status: dhe.status,
          health_reason: dhe.reason,
        });
      }

      // Handle hub health events
      if (event.hubHealthEvent) {
        const hhe = event.hubHealthEvent;
        hostname = hhe.hubId.substring(0, 12);
        appName = 'smartthings-hub';
        message = `Hub health: ${hhe.status}${hhe.reason ? ` (${hhe.reason})` : ''}`;
        Object.assign(structuredData, {
          hub_id: hhe.hubId,
          hub_status: hhe.status,
          hub_reason: hhe.reason,
        });
      }

      return {
        timestamp: event.eventTime || receivedAt,
        hostname,
        app_name: appName,
        severity,
        facility: 1,
        message,
        raw: JSON.stringify(event),
        structured_data: JSON.stringify(structuredData),
        source_ip: null,
      };
    });

    if (logs.length > 0) {
      await insertLogs(logs);
    }

    res.status(200).json({
      status: 'ok',
      received: events.length,
      stored: logs.length,
    });
  } catch (error) {
    console.error('SmartThings ingestion error:', error);
    res.status(500).json({
      error: 'Failed to process SmartThings events',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================================================
// Validate/Preview Endpoint (Dry Run)
// =============================================================================

/**
 * POST /api/ingest/validate
 *
 * Validates JSON payload and returns extracted fields WITHOUT storing.
 * Used by the "Add Data Source" wizard for live field preview.
 *
 * Authentication: Optional (works without auth for testing)
 */
router.post('/validate', async (req, res) => {
  try {
    const { payload } = req.body;

    if (!payload) {
      return res.status(400).json({
        error: 'Missing payload',
        message: 'Request body must include a "payload" field with the JSON to validate',
      });
    }

    // Handle both single object and array
    const events = Array.isArray(payload) ? payload : [payload];
    const warnings: string[] = [];

    const extractedFields = events.map((event: Record<string, unknown>) => {
      // Try to extract timestamp from various common field names
      let timestamp: string | null = null;
      let timestampField: string | null = null;
      const tsFieldNames = ['timestamp', 'time', '@timestamp', 'ts', 'datetime', 'created_at', 'date'];

      for (const fieldName of tsFieldNames) {
        if (event[fieldName]) {
          timestampField = fieldName;
          const tsField = event[fieldName];
          if (typeof tsField === 'number') {
            timestamp = new Date(tsField > 1e12 ? tsField : tsField * 1000).toISOString();
          } else if (typeof tsField === 'string') {
            try {
              timestamp = new Date(tsField).toISOString();
            } catch {
              timestamp = null;
            }
          }
          break;
        }
      }

      if (!timestamp) {
        warnings.push('No timestamp field found - server time will be used');
      }

      // Extract hostname
      let hostname: string | null = null;
      let hostnameField: string | null = null;
      const hostFieldNames = ['hostname', 'host', 'source', 'server', 'machine', 'origin'];

      for (const fieldName of hostFieldNames) {
        if (event[fieldName]) {
          hostnameField = fieldName;
          hostname = String(event[fieldName]);
          break;
        }
      }

      // Extract app name
      let appName: string | null = null;
      let appNameField: string | null = null;
      const appFieldNames = ['app_name', 'app', 'application', 'program', 'service', 'component'];

      for (const fieldName of appFieldNames) {
        if (event[fieldName]) {
          appNameField = fieldName;
          appName = String(event[fieldName]);
          break;
        }
      }

      // Extract message
      let message: string | null = null;
      let messageField: string | null = null;
      const msgFieldNames = ['message', 'msg', 'log', 'text', 'body', 'content'];

      for (const fieldName of msgFieldNames) {
        if (event[fieldName]) {
          messageField = fieldName;
          message = String(event[fieldName]);
          break;
        }
      }

      if (!message) {
        message = JSON.stringify(event);
        warnings.push('No message field found - entire JSON will be used as message');
      }

      // Extract severity
      let severity = 6; // default info
      let severityField: string | null = null;
      const levelFieldNames = ['level', 'severity', 'loglevel', 'priority'];

      for (const fieldName of levelFieldNames) {
        if (event[fieldName] !== undefined) {
          severityField = fieldName;
          const levelField = event[fieldName];
          if (typeof levelField === 'number') {
            severity = Math.min(7, Math.max(0, levelField));
          } else {
            const lvl = String(levelField).toLowerCase();
            if (lvl.includes('fatal') || lvl.includes('crit') || lvl.includes('emergency')) severity = 2;
            else if (lvl.includes('error') || lvl.includes('err')) severity = 3;
            else if (lvl.includes('warn')) severity = 4;
            else if (lvl.includes('notice')) severity = 5;
            else if (lvl.includes('info')) severity = 6;
            else if (lvl.includes('debug') || lvl.includes('trace')) severity = 7;
          }
          break;
        }
      }

      // Get all custom fields (fields not in the standard extraction list)
      const standardFields = new Set([
        ...tsFieldNames, ...hostFieldNames, ...appFieldNames,
        ...msgFieldNames, ...levelFieldNames
      ]);

      const customFields: Record<string, { value: unknown; type: string }> = {};
      for (const [key, value] of Object.entries(event)) {
        if (!standardFields.has(key)) {
          customFields[key] = {
            value,
            type: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
          };
        }
      }

      return {
        standard_fields: {
          timestamp: { value: timestamp, detected_from: timestampField },
          hostname: { value: hostname || 'unknown', detected_from: hostnameField },
          app_name: { value: appName || 'generic', detected_from: appNameField },
          severity: { value: severity, detected_from: severityField },
          message: { value: message, detected_from: messageField },
        },
        custom_fields: customFields,
        custom_field_count: Object.keys(customFields).length,
      };
    });

    res.json({
      success: true,
      event_count: events.length,
      extracted: extractedFields.length === 1 ? extractedFields[0] : extractedFields,
      warnings: [...new Set(warnings)], // Deduplicate
      storage_preview: {
        message: extractedFields[0]?.standard_fields.message.value,
        structured_data: 'Full JSON payload preserved in structured_data column',
      },
    });
  } catch (error) {
    console.error('Validate error:', error);
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: error instanceof Error ? error.message : 'Invalid JSON payload',
    });
  }
});

export default router;
