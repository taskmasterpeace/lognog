import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../auth/middleware.js';
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
 */
router.post('/otlp/v1/logs', async (req, res) => {
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

export default router;
