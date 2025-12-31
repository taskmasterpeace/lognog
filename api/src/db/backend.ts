/**
 * Database Backend Abstraction Layer
 *
 * This module provides a unified interface for log storage that works with
 * either ClickHouse (Full) or SQLite (Lite).
 *
 * Set LOGNOG_BACKEND environment variable:
 * - 'clickhouse' (default for Docker) - Uses ClickHouse for log storage
 * - 'sqlite' - Uses SQLite for log storage (LogNog Lite)
 */

import * as clickhouse from './clickhouse.js';
import * as sqliteLogs from './sqlite-logs.js';
import { parseToAST } from '../dsl/index.js';
import { compileDSL } from '../dsl/compiler.js';
import { compileDSLToSQLite, parseRelativeTimeSQLite } from '../dsl/compiler-sqlite.js';

export type Backend = 'clickhouse' | 'sqlite';

// Get the configured backend
export function getBackend(): Backend {
  const backend = process.env.LOGNOG_BACKEND?.toLowerCase();
  if (backend === 'sqlite') {
    return 'sqlite';
  }
  return 'clickhouse';
}

// Check if we're running in Lite mode
export function isLiteMode(): boolean {
  return getBackend() === 'sqlite';
}

/**
 * Insert logs into the configured backend
 */
export async function insertLogs(logs: Record<string, unknown>[]): Promise<void> {
  if (isLiteMode()) {
    return sqliteLogs.insertLogs(logs);
  }
  return clickhouse.insertLogs(logs);
}

/**
 * Execute a raw SQL query (backend-specific SQL)
 */
export async function executeRawQuery<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  if (isLiteMode()) {
    return sqliteLogs.executeQuery<T>(sql, params);
  }
  return clickhouse.executeQuery<T>(sql, params);
}

/**
 * Compile and execute a DSL query against the configured backend
 */
export async function executeDSLQuery<T = Record<string, unknown>>(
  dslQuery: string,
  options?: {
    earliest?: string;
    latest?: string;
  }
): Promise<{ sql: string; results: T[] }> {
  const ast = parseToAST(dslQuery);

  if (isLiteMode()) {
    // Compile to SQLite SQL
    const compiled = compileDSLToSQLite(ast);
    let sql = compiled.sql;

    // Add time range conditions
    if (options?.earliest || options?.latest) {
      const timeConditions: string[] = [];

      if (options.earliest) {
        const timeExpr = parseRelativeTimeSQLite(options.earliest);
        if (timeExpr) {
          timeConditions.push(`timestamp >= ${timeExpr}`);
        }
      }
      if (options.latest) {
        const timeExpr = parseRelativeTimeSQLite(options.latest);
        if (timeExpr) {
          timeConditions.push(`timestamp <= ${timeExpr}`);
        }
      }

      if (timeConditions.length > 0) {
        if (sql.includes('WHERE')) {
          sql = sql.replace('WHERE', `WHERE ${timeConditions.join(' AND ')} AND`);
        } else if (sql.includes('FROM logs')) {
          sql = sql.replace('FROM logs', `FROM logs WHERE ${timeConditions.join(' AND ')}`);
        }
      }
    }

    const results = await sqliteLogs.executeQuery<T>(sql);
    return { sql, results };
  } else {
    // Compile to ClickHouse SQL
    const compiled = compileDSL(ast);
    let sql = compiled.sql;

    // Add time range conditions (ClickHouse format)
    if (options?.earliest || options?.latest) {
      const timeConditions: string[] = [];

      if (options.earliest) {
        const match = options.earliest.match(/^-(\d+)([mhdw])$/i);
        if (match) {
          const value = parseInt(match[1], 10);
          const unit = match[2].toLowerCase();
          const unitMap: Record<string, string> = {
            'm': 'MINUTE', 'h': 'HOUR', 'd': 'DAY', 'w': 'WEEK',
          };
          const clickhouseUnit = unitMap[unit];
          if (clickhouseUnit) {
            timeConditions.push(`timestamp >= now() - INTERVAL ${value} ${clickhouseUnit}`);
          }
        }
      }
      if (options.latest) {
        const match = options.latest.match(/^-(\d+)([mhdw])$/i);
        if (match) {
          const value = parseInt(match[1], 10);
          const unit = match[2].toLowerCase();
          const unitMap: Record<string, string> = {
            'm': 'MINUTE', 'h': 'HOUR', 'd': 'DAY', 'w': 'WEEK',
          };
          const clickhouseUnit = unitMap[unit];
          if (clickhouseUnit) {
            timeConditions.push(`timestamp <= now() - INTERVAL ${value} ${clickhouseUnit}`);
          }
        }
      }

      if (timeConditions.length > 0) {
        if (sql.includes('WHERE')) {
          sql = sql.replace('WHERE', `WHERE ${timeConditions.join(' AND ')} AND`);
        } else if (sql.includes('FROM lognog.logs')) {
          sql = sql.replace('FROM lognog.logs', `FROM lognog.logs WHERE ${timeConditions.join(' AND ')}`);
        }
      }
    }

    const results = await clickhouse.executeQuery<T>(sql);
    return { sql, results };
  }
}

/**
 * Health check for the configured backend
 */
export async function healthCheck(): Promise<boolean> {
  if (isLiteMode()) {
    return sqliteLogs.healthCheck();
  }
  return clickhouse.healthCheck();
}

/**
 * Close database connections
 */
export async function closeConnections(): Promise<void> {
  if (isLiteMode()) {
    return sqliteLogs.closeConnection();
  }
  return clickhouse.closeConnection();
}

/**
 * Get available fields (for autocomplete)
 */
export async function getFields(): Promise<{ name: string; type: string }[]> {
  if (isLiteMode()) {
    // Return static field list for SQLite
    return [
      { name: 'timestamp', type: 'TEXT' },
      { name: 'hostname', type: 'TEXT' },
      { name: 'app_name', type: 'TEXT' },
      { name: 'severity', type: 'INTEGER' },
      { name: 'facility', type: 'INTEGER' },
      { name: 'priority', type: 'INTEGER' },
      { name: 'message', type: 'TEXT' },
      { name: 'raw', type: 'TEXT' },
      { name: 'structured_data', type: 'TEXT' },
      { name: 'index_name', type: 'TEXT' },
      { name: 'protocol', type: 'TEXT' },
      { name: 'source_ip', type: 'TEXT' },
      { name: 'source_port', type: 'INTEGER' },
    ];
  }
  return clickhouse.executeQuery<{ name: string; type: string }>(
    "SELECT name, type FROM system.columns WHERE database = 'lognog' AND table = 'logs'"
  );
}

/**
 * Get unique values for a field (for autocomplete)
 */
export async function getFieldValues(
  field: string,
  limit: number = 100
): Promise<{ value: string; count: number }[]> {
  const validFields = ['hostname', 'app_name', 'severity', 'facility', 'index_name', 'protocol'];
  if (!validFields.includes(field)) {
    throw new Error('Invalid field');
  }

  if (isLiteMode()) {
    return sqliteLogs.executeQuery<{ value: string; count: number }>(
      `SELECT ${field} as value, COUNT(*) as count FROM logs GROUP BY ${field} ORDER BY count DESC LIMIT ${limit}`
    );
  }
  return clickhouse.executeQuery<{ value: string; count: number }>(
    `SELECT ${field} as value, count() as count FROM lognog.logs GROUP BY ${field} ORDER BY count DESC LIMIT ${limit}`
  );
}

/**
 * Get backend info for status display
 */
export function getBackendInfo(): {
  backend: Backend;
  name: string;
  description: string;
} {
  const backend = getBackend();
  if (backend === 'sqlite') {
    return {
      backend: 'sqlite',
      name: 'LogNog Lite',
      description: 'SQLite-based storage (recommended for <100K logs/day)',
    };
  }
  return {
    backend: 'clickhouse',
    name: 'LogNog Full',
    description: 'ClickHouse-based storage (scales to billions of logs)',
  };
}

/**
 * Discovered field from structured_data
 */
export interface DiscoveredField {
  name: string;
  type: string;
  occurrences: number;
  sampleValues: string[];
}

/**
 * Discover custom fields from structured_data JSON column
 * Scans recent logs to find unique field names and their types
 */
export async function discoverStructuredDataFields(options?: {
  earliest?: string;
  latest?: string;
  limit?: number;
  index?: string;
}): Promise<DiscoveredField[]> {
  const limit = options?.limit || 50;

  if (isLiteMode()) {
    // SQLite: Use json_each to extract keys from structured_data
    let sql = `
      SELECT
        json_each.key as name,
        typeof(json_each.value) as type,
        COUNT(*) as occurrences
      FROM logs, json_each(structured_data)
      WHERE structured_data IS NOT NULL
        AND structured_data != '{}'
        AND structured_data != ''
    `;

    // Add time filter
    if (options?.earliest) {
      const match = options.earliest.match(/^-(\d+)([mhdw])$/i);
      if (match) {
        const value = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        const unitMap: Record<string, string> = {
          'm': 'minutes', 'h': 'hours', 'd': 'days', 'w': 'days',
        };
        const multiplier = unit === 'w' ? value * 7 : value;
        sql += ` AND timestamp >= datetime('now', '-${multiplier} ${unitMap[unit]}')`;
      }
    }

    // Add index filter
    if (options?.index) {
      sql += ` AND index_name = '${options.index.replace(/'/g, "''")}'`;
    }

    sql += `
      GROUP BY json_each.key
      ORDER BY occurrences DESC
      LIMIT ${limit}
    `;

    const results = await sqliteLogs.executeQuery<{
      name: string;
      type: string;
      occurrences: number;
    }>(sql);

    // For SQLite, we need to get sample values in a separate query
    const fieldsWithSamples: DiscoveredField[] = [];
    for (const field of results) {
      // Get sample values for this field
      const sampleSql = `
        SELECT DISTINCT json_extract(structured_data, '$.' || ?) as val
        FROM logs
        WHERE structured_data IS NOT NULL
          AND json_extract(structured_data, '$.' || ?) IS NOT NULL
        LIMIT 5
      `;
      try {
        const samples = await sqliteLogs.executeQuery<{ val: string }>(
          sampleSql.replace(/\?/g, `'${field.name.replace(/'/g, "''")}'`)
        );
        fieldsWithSamples.push({
          name: field.name,
          type: mapSQLiteType(field.type),
          occurrences: field.occurrences,
          sampleValues: samples.map(s => String(s.val)).filter(v => v !== 'null'),
        });
      } catch {
        fieldsWithSamples.push({
          name: field.name,
          type: mapSQLiteType(field.type),
          occurrences: field.occurrences,
          sampleValues: [],
        });
      }
    }

    return fieldsWithSamples;
  } else {
    // ClickHouse: Use JSONExtractKeys to get all keys
    let sql = `
      SELECT
        arrayJoin(JSONExtractKeys(structured_data)) as name,
        count() as occurrences
      FROM lognog.logs
      WHERE structured_data != '{}'
        AND length(structured_data) > 2
    `;

    // Add time filter
    if (options?.earliest) {
      const match = options.earliest.match(/^-(\d+)([mhdw])$/i);
      if (match) {
        const value = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        const unitMap: Record<string, string> = {
          'm': 'MINUTE', 'h': 'HOUR', 'd': 'DAY', 'w': 'WEEK',
        };
        sql += ` AND timestamp >= now() - INTERVAL ${value} ${unitMap[unit]}`;
      }
    }

    // Add index filter
    if (options?.index) {
      sql += ` AND index_name = '${options.index.replace(/'/g, "\\'")}'`;
    }

    sql += `
      GROUP BY name
      ORDER BY occurrences DESC
      LIMIT ${limit}
    `;

    const results = await clickhouse.executeQuery<{
      name: string;
      occurrences: number;
    }>(sql);

    // Get sample values and types for each field
    const fieldsWithSamples: DiscoveredField[] = [];
    for (const field of results) {
      try {
        const sampleSql = `
          SELECT
            JSONType(structured_data, '${field.name.replace(/'/g, "\\'")}') as type,
            groupUniqArray(5)(JSONExtractString(structured_data, '${field.name.replace(/'/g, "\\'")}')) as samples
          FROM lognog.logs
          WHERE structured_data != '{}'
            AND JSONHas(structured_data, '${field.name.replace(/'/g, "\\'")}')
          LIMIT 1
        `;
        const typeInfo = await clickhouse.executeQuery<{
          type: string;
          samples: string[];
        }>(sampleSql);

        fieldsWithSamples.push({
          name: field.name,
          type: mapClickHouseJSONType(typeInfo[0]?.type || 'String'),
          occurrences: Number(field.occurrences),
          sampleValues: typeInfo[0]?.samples || [],
        });
      } catch {
        fieldsWithSamples.push({
          name: field.name,
          type: 'string',
          occurrences: Number(field.occurrences),
          sampleValues: [],
        });
      }
    }

    return fieldsWithSamples;
  }
}

/**
 * Map SQLite typeof() result to standard type names
 */
function mapSQLiteType(type: string): string {
  const typeMap: Record<string, string> = {
    'text': 'string',
    'integer': 'number',
    'real': 'number',
    'null': 'null',
    'blob': 'binary',
  };
  return typeMap[type.toLowerCase()] || 'string';
}

/**
 * Map ClickHouse JSON type to standard type names
 */
function mapClickHouseJSONType(type: string): string {
  const typeMap: Record<string, string> = {
    'String': 'string',
    'Int64': 'number',
    'UInt64': 'number',
    'Float64': 'number',
    'Bool': 'boolean',
    'Array': 'array',
    'Object': 'object',
    'Null': 'null',
  };
  return typeMap[type] || 'string';
}

/**
 * Active source info for the Data Sources dashboard
 */
export interface ActiveSource {
  app_name: string;
  index_name: string;
  hostname: string;
  protocol: string;
  log_count: number;
  last_seen: string;
  error_count: number;
}

export interface IndexSummary {
  index_name: string;
  count: number;
  sources: number;
}

export interface ActiveSourcesResult {
  sources: ActiveSource[];
  by_index: IndexSummary[];
}

/**
 * Get active log sources with stats from the last 7 days
 */
export async function getActiveSources(): Promise<ActiveSourcesResult> {
  if (isLiteMode()) {
    // SQLite version
    const sourcesResult = await sqliteLogs.executeQuery<{
      app_name: string;
      index_name: string;
      hostname: string;
      protocol: string;
      log_count: number;
      last_seen: string;
      error_count: number;
    }>(`
      SELECT
        COALESCE(app_name, 'unknown') as app_name,
        COALESCE(index_name, 'main') as index_name,
        COALESCE(hostname, 'unknown') as hostname,
        COALESCE(protocol, 'unknown') as protocol,
        COUNT(*) as log_count,
        MAX(timestamp) as last_seen,
        SUM(CASE WHEN severity <= 3 THEN 1 ELSE 0 END) as error_count
      FROM logs
      WHERE timestamp >= datetime('now', '-7 days')
      GROUP BY app_name, index_name
      ORDER BY log_count DESC
      LIMIT 50
    `);

    const indexResult = await sqliteLogs.executeQuery<{
      index_name: string;
      count: number;
      sources: number;
    }>(`
      SELECT
        COALESCE(index_name, 'main') as index_name,
        COUNT(*) as count,
        COUNT(DISTINCT app_name) as sources
      FROM logs
      WHERE timestamp >= datetime('now', '-7 days')
      GROUP BY index_name
      ORDER BY count DESC
    `);

    return {
      sources: sourcesResult,
      by_index: indexResult,
    };
  } else {
    // ClickHouse version
    const sourcesResult = await clickhouse.executeQuery<{
      app_name: string;
      index_name: string;
      hostname: string;
      protocol: string;
      log_count: number;
      last_seen: string;
      error_count: number;
    }>(`
      SELECT
        COALESCE(app_name, 'unknown') as app_name,
        COALESCE(index_name, 'main') as index_name,
        any(COALESCE(hostname, 'unknown')) as hostname,
        any(COALESCE(protocol, 'unknown')) as protocol,
        count() as log_count,
        max(timestamp) as last_seen,
        countIf(severity <= 3) as error_count
      FROM lognog.logs
      WHERE timestamp >= now() - INTERVAL 7 DAY
      GROUP BY app_name, index_name
      ORDER BY log_count DESC
      LIMIT 50
    `);

    const indexResult = await clickhouse.executeQuery<{
      index_name: string;
      count: number;
      sources: number;
    }>(`
      SELECT
        COALESCE(index_name, 'main') as index_name,
        count() as count,
        uniq(app_name) as sources
      FROM lognog.logs
      WHERE timestamp >= now() - INTERVAL 7 DAY
      GROUP BY index_name
      ORDER BY count DESC
    `);

    return {
      sources: sourcesResult.map(s => ({
        ...s,
        log_count: Number(s.log_count),
        error_count: Number(s.error_count),
      })),
      by_index: indexResult.map(i => ({
        ...i,
        count: Number(i.count),
        sources: Number(i.sources),
      })),
    };
  }
}
