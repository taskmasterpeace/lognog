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
