import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, authenticateIngestion } from '../auth/middleware.js';
import { logAuthEvent } from '../auth/auth.js';
import { insertLogs, getBackendInfo } from '../db/backend.js';
import { getPendingNotifications, markNotificationDelivered, AgentNotification } from '../db/sqlite.js';

const router = Router();

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
      await insertLogs(logs);

      // Log the ingestion
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
    await insertLogs(logs);

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

      // Extract common fields
      const hostname = String(event.hostname || event.host || event.source || 'unknown');
      const appName = String(event.app_name || event.app || event.application || event.program || event.service || 'generic');
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
        index_name: 'http',
        protocol: 'http',
      };
    });

    if (logs.length === 0) {
      return res.status(200).json({ accepted: 0 });
    }

    await insertLogs(logs);

    console.log(`HTTP: Ingested ${logs.length} log events`);

    if (req.user) {
      logAuthEvent(req.user.id, 'http_ingest', req.ip, req.get('user-agent'), {
        logs_count: logs.length,
      });
    }

    res.status(200).json({
      accepted: logs.length,
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

export default router;
