/**
 * Demo Data Routes
 *
 * API endpoints for importing, exporting, generating, and clearing demo log data.
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../auth/middleware.js';
import { insertLogs, executeRawQuery, getBackend } from '../db/backend.js';
import { generateMockLogs, exportLogsToJSON, importLogsFromJSON } from '../services/mock-data.js';
import { logAuthEvent } from '../auth/auth.js';

const router = Router();

// Schema for generate request
const generateRequestSchema = z.object({
  count: z.number().int().min(1).max(10000).default(100),
  timeRange: z.object({
    start: z.string().default('-1h'),
    end: z.string().default('now'),
  }).optional(),
  types: z.array(z.enum(['syslog', 'nginx', 'auth', 'app', 'firewall', 'database'])).optional(),
  hostnames: z.array(z.string()).optional(),
});

// Schema for import request
const importRequestSchema = z.object({
  logs: z.array(z.record(z.unknown())).min(1).max(10000),
});

/**
 * POST /api/demo/generate
 *
 * Generate realistic mock log data.
 * Requires authentication with 'write' permission.
 */
router.post('/generate', authenticate, requirePermission('write'), async (req, res) => {
  try {
    const params = generateRequestSchema.parse(req.body);

    // Generate mock logs
    const logs = generateMockLogs({
      count: params.count,
      timeRange: params.timeRange || { start: '-1h', end: 'now' },
      types: params.types,
      hostnames: params.hostnames,
    });

    // Insert into database
    await insertLogs(logs);

    // Log the action
    logAuthEvent(req.user!.id, 'demo_generate', req.ip, req.get('user-agent'), {
      count: logs.length,
    });

    console.log(`Generated ${logs.length} demo logs`);

    res.json({
      success: true,
      generated: logs.length,
      timeRange: params.timeRange,
      message: `Successfully generated ${logs.length} mock log entries`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    console.error('Demo generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate demo data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/demo/import
 *
 * Import log data from JSON.
 * Requires authentication with 'write' permission.
 */
router.post('/import', authenticate, requirePermission('write'), async (req, res) => {
  try {
    const params = importRequestSchema.parse(req.body);

    // Validate and normalize logs
    const logs = params.logs.map((log) => {
      // Ensure required fields exist
      if (!log.timestamp || !log.hostname || !log.message) {
        throw new Error('Invalid log format: missing required fields (timestamp, hostname, message)');
      }

      // Set defaults for missing fields
      return {
        timestamp: log.timestamp,
        received_at: log.received_at || new Date().toISOString(),
        hostname: log.hostname,
        app_name: log.app_name || 'imported',
        message: log.message,
        severity: log.severity || 6,
        facility: log.facility || 1,
        priority: log.priority || ((1 * 8) + 6),
        raw: log.raw || JSON.stringify(log),
        structured_data: log.structured_data || '{}',
        index_name: log.index_name || 'demo',
        protocol: log.protocol,
        source_ip: log.source_ip,
        source_port: log.source_port,
      };
    });

    // Insert into database
    await insertLogs(logs);

    // Log the action
    logAuthEvent(req.user!.id, 'demo_import', req.ip, req.get('user-agent'), {
      count: logs.length,
    });

    console.log(`Imported ${logs.length} logs`);

    res.json({
      success: true,
      imported: logs.length,
      message: `Successfully imported ${logs.length} log entries`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    console.error('Import error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/demo/export
 *
 * Export log data as JSON.
 * Requires authentication with 'read' permission.
 *
 * Query parameters:
 * - limit: number of logs to export (default: 1000, max: 10000)
 * - earliest: start time (e.g., '-24h')
 * - latest: end time (e.g., 'now')
 */
router.get('/export', authenticate, requirePermission('read'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 1000, 10000);
    const earliest = req.query.earliest as string || '-24h';
    const latest = req.query.latest as string || 'now';

    let sql: string;
    const backend = getBackend();

    if (backend === 'sqlite') {
      // SQLite version
      const parseRelativeTime = (timeStr: string): string => {
        if (timeStr === 'now') return 'datetime(\'now\')';
        const match = timeStr.match(/^-(\d+)([mhdw])$/);
        if (!match) return `'${timeStr}'`;

        const value = parseInt(match[1], 10);
        const unit = match[2];
        const unitMap: Record<string, string> = {
          'm': 'minutes', 'h': 'hours', 'd': 'days', 'w': 'days'
        };
        const multiplier = unit === 'w' ? value * 7 : value;
        return `datetime('now', '-${multiplier} ${unitMap[unit]}')`;
      };

      sql = `
        SELECT * FROM logs
        WHERE timestamp >= ${parseRelativeTime(earliest)}
        AND timestamp <= ${parseRelativeTime(latest)}
        ORDER BY timestamp DESC
        LIMIT ${limit}
      `;
    } else {
      // ClickHouse version
      const parseRelativeTime = (timeStr: string): string => {
        if (timeStr === 'now') return 'now()';
        const match = timeStr.match(/^-(\d+)([mhdw])$/);
        if (!match) return `'${timeStr}'`;

        const value = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        const unitMap: Record<string, string> = {
          'm': 'MINUTE', 'h': 'HOUR', 'd': 'DAY', 'w': 'WEEK'
        };
        return `now() - INTERVAL ${value} ${unitMap[unit]}`;
      };

      sql = `
        SELECT * FROM lognog.logs
        WHERE timestamp >= ${parseRelativeTime(earliest)}
        AND timestamp <= ${parseRelativeTime(latest)}
        ORDER BY timestamp DESC
        LIMIT ${limit}
      `;
    }

    const logs = await executeRawQuery(sql);

    // Log the action
    logAuthEvent(req.user!.id, 'demo_export', req.ip, req.get('user-agent'), {
      count: logs.length,
    });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="lognog-export-${Date.now()}.json"`);
    res.send(exportLogsToJSON(logs));
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/demo/clear
 *
 * Clear all demo/test data from the database.
 * Requires authentication with 'admin' permission.
 *
 * Query parameters:
 * - confirm: must be 'yes' to proceed
 * - index: specific index to clear (optional, default: clear all)
 */
router.delete('/clear', authenticate, requirePermission('admin'), async (req, res) => {
  try {
    const confirm = req.query.confirm as string;
    const index = req.query.index as string;

    if (confirm !== 'yes') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation required',
        message: 'Add ?confirm=yes query parameter to confirm deletion',
      });
    }

    let sql: string;
    const backend = getBackend();

    if (backend === 'sqlite') {
      if (index) {
        sql = `DELETE FROM logs WHERE index_name = '${index}'`;
      } else {
        sql = 'DELETE FROM logs';
      }
    } else {
      if (index) {
        sql = `ALTER TABLE lognog.logs DELETE WHERE index_name = '${index}'`;
      } else {
        sql = 'TRUNCATE TABLE lognog.logs';
      }
    }

    await executeRawQuery(sql);

    // Log the action
    logAuthEvent(req.user!.id, 'demo_clear', req.ip, req.get('user-agent'), {
      index: index || 'all',
    });

    console.log(`Cleared ${index ? `index: ${index}` : 'all logs'}`);

    res.json({
      success: true,
      message: index
        ? `Successfully cleared all logs from index: ${index}`
        : 'Successfully cleared all logs from database',
    });
  } catch (error) {
    console.error('Clear error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/demo/stats
 *
 * Get statistics about demo/test data.
 * Requires authentication with 'read' permission.
 */
router.get('/stats', authenticate, requirePermission('read'), async (req, res) => {
  try {
    const backend = getBackend();
    let totalSql: string;
    let indexSql: string;
    let oldestSql: string;
    let newestSql: string;

    if (backend === 'sqlite') {
      totalSql = 'SELECT COUNT(*) as total FROM logs';
      indexSql = 'SELECT index_name, COUNT(*) as count FROM logs GROUP BY index_name ORDER BY count DESC';
      oldestSql = 'SELECT MIN(timestamp) as oldest FROM logs';
      newestSql = 'SELECT MAX(timestamp) as newest FROM logs';
    } else {
      totalSql = 'SELECT count() as total FROM lognog.logs';
      indexSql = 'SELECT index_name, count() as count FROM lognog.logs GROUP BY index_name ORDER BY count DESC';
      oldestSql = 'SELECT min(timestamp) as oldest FROM lognog.logs';
      newestSql = 'SELECT max(timestamp) as newest FROM lognog.logs';
    }

    const [totalResult, indexResult, oldestResult, newestResult] = await Promise.all([
      executeRawQuery<{ total: number }>(totalSql),
      executeRawQuery<{ index_name: string; count: number }>(indexSql),
      executeRawQuery<{ oldest: string }>(oldestSql),
      executeRawQuery<{ newest: string }>(newestSql),
    ]);

    res.json({
      success: true,
      backend,
      stats: {
        total: Number(totalResult[0]?.total || 0),
        by_index: indexResult,
        oldest: oldestResult[0]?.oldest || null,
        newest: newestResult[0]?.newest || null,
      },
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
