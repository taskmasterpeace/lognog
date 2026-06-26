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
import { compileDSLToSQLite } from '../dsl/compiler-sqlite.js';
import { logQueryExecution } from '../services/internal-logger.js';
import { applyLookup } from '../services/lookup-tables.js';
import { recordHeartbeats } from '../services/heartbeat.js';
import type { ASTNode, LookupNode, Condition, SimpleCondition } from '../dsl/types.js';
import { isLogicGroup } from '../dsl/types.js';
import { indexScopeSqlClause } from '../auth/index-scope.js';

export type Backend = 'clickhouse' | 'sqlite';

// Index names are constrained to a safe identifier charset. Used to validate
// caller-supplied `options.index` before it is interpolated into SQL (#37-10).
const INDEX_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Escape a string for a single-quoted SQL literal. Doubling the single quote is
 * the correct, portable form for both ClickHouse and SQLite; the previous
 * ClickHouse path used backslash escaping (`\\'`) which is wrong for ClickHouse
 * string literals and breaks on a trailing backslash (#37-10).
 */
function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

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
    await sqliteLogs.insertLogs(logs);
  } else {
    await clickhouse.insertLogs(logs);
  }

  // Phase 3: track presence cheaply for heartbeat / no-data monitoring.
  // MUST never break ingestion — swallow any error.
  try {
    recordHeartbeats(logs as Array<{ index_name?: string; hostname?: string }>);
  } catch (error) {
    console.warn('[Heartbeat] recordHeartbeats threw from insertLogs:', error);
  }
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
    user_id?: string;  // For internal logging
    allowedIndexes?: string[];  // Read-side index scoping (Phase 5)
  }
): Promise<{ sql: string; results: T[] }> {
  const startTime = Date.now();

  try {
    const ast = parseToAST(dslQuery);

    // Split AST at lookup stages: compile pre-lookup to SQL, post-lookup as in-memory
    const lookupIndex = ast.stages.findIndex(s => s.type === 'lookup');
    const hasLookup = lookupIndex !== -1;
    let postLookupStages: ASTNode[] = [];

    if (hasLookup) {
      // Extract stages from lookup onwards for post-processing
      postLookupStages = ast.stages.splice(lookupIndex);
    }

    if (isLiteMode()) {
      // Compile to SQLite SQL (with mandatory read-side index scoping applied
      // pre-lookup, so any post-lookup in-memory stages already see constrained
      // rows). Time bounds are passed into the compiler so they are built into
      // the top-level WHERE rather than spliced in afterwards (#37/#41-11).
      const compiled = compileDSLToSQLite(ast, options?.allowedIndexes, {
        earliest: options?.earliest,
        latest: options?.latest,
      });
      const sql = compiled.sql;

      let results = await sqliteLogs.executeQuery<T>(sql);

      // Apply lookup + post-lookup stages as in-memory post-processing
      if (hasLookup) {
        results = applyPostLookupStages(results as Record<string, unknown>[], postLookupStages) as T[];
      }

      // Log query execution
      logQueryExecution({
        dsl_query: dslQuery.substring(0, 500),  // Truncate long queries
        execution_time_ms: Date.now() - startTime,
        row_count: results.length,
        user_id: options?.user_id,
      });

      return { sql, results };
    } else {
      // Compile to ClickHouse SQL (with mandatory read-side index scoping applied
      // pre-lookup, so any post-lookup in-memory stages already see constrained
      // rows). Time bounds are passed into the compiler so they are built into
      // the top-level WHERE rather than spliced in afterwards with sql.replace,
      // which only hit the first match and could land in a subquery/CTE or be
      // dropped (#37/#41-11).
      const compiled = compileDSL(ast, options?.allowedIndexes, {
        earliest: options?.earliest,
        latest: options?.latest,
      });
      const sql = compiled.sql;

      let results = await clickhouse.executeQuery<T>(sql);

      // Apply lookup + post-lookup stages as in-memory post-processing
      if (hasLookup) {
        results = applyPostLookupStages(results as Record<string, unknown>[], postLookupStages) as T[];
      }

      // Log query execution
      logQueryExecution({
        dsl_query: dslQuery.substring(0, 500),  // Truncate long queries
        execution_time_ms: Date.now() - startTime,
        row_count: results.length,
        user_id: options?.user_id,
      });

      return { sql, results };
    }
  } catch (err) {
    // Log failed query execution
    logQueryExecution({
      dsl_query: dslQuery.substring(0, 500),
      execution_time_ms: Date.now() - startTime,
      row_count: 0,
      user_id: options?.user_id,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Apply post-lookup stages (lookup enrichment + in-memory where/filter) to results.
 * Called when a DSL query contains | lookup stages that can't be compiled to SQL.
 */
function applyPostLookupStages(
  results: Record<string, unknown>[],
  stages: ASTNode[]
): Record<string, unknown>[] {
  // Flatten structured_data JSON fields into top-level for lookup matching and template access
  let data = results.map(row => {
    const sd = row.structured_data;
    if (!sd) return row;
    const parsed = typeof sd === 'string' ? (() => { try { return JSON.parse(sd); } catch { return null; } })() : sd;
    if (!parsed || typeof parsed !== 'object') return row;
    // Merge structured_data fields, but don't overwrite existing top-level fields
    const flat = { ...row };
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!(k in flat)) flat[k] = v;
    }
    return flat;
  });

  for (const stage of stages) {
    if (stage.type === 'lookup') {
      const s = stage as LookupNode;
      data = applyLookup(
        data,
        s.lookupTable,
        s.field,
        s.matchField,
        s.outputFields.length > 0 ? s.outputFields : undefined
      );
    } else if (stage.type === 'where' || stage.type === 'filter') {
      const conditions = (stage as unknown as { conditions: Condition[] }).conditions;
      data = data.filter(row => evaluateConditions(row, conditions));
    }
  }

  return data;
}

/**
 * Evaluate DSL conditions in-memory against a result row.
 */
function evaluateConditions(row: Record<string, unknown>, conditions: Condition[]): boolean {
  return conditions.every(cond => evaluateCondition(row, cond));
}

function evaluateCondition(row: Record<string, unknown>, cond: Condition): boolean {
  if (isLogicGroup(cond)) {
    if (cond.logic === 'AND') {
      return cond.conditions.every(c => evaluateCondition(row, c));
    } else {
      return cond.conditions.some(c => evaluateCondition(row, c));
    }
  }

  const sc = cond as SimpleCondition;
  let fieldValue = row[sc.field];
  // Fall back to structured_data JSON for custom fields
  if (fieldValue === undefined || fieldValue === null) {
    const sd = row.structured_data;
    if (sd) {
      const parsed = typeof sd === 'string' ? (() => { try { return JSON.parse(sd as string); } catch { return null; } })() : sd;
      if (parsed && typeof parsed === 'object') {
        fieldValue = (parsed as Record<string, unknown>)[sc.field];
      }
    }
  }
  const rowVal = fieldValue !== undefined && fieldValue !== null ? String(fieldValue) : '';
  const cmpVal = sc.value !== undefined && sc.value !== null ? String(sc.value) : '';

  let result: boolean;
  switch (sc.operator) {
    case '=':
      result = rowVal === cmpVal;
      break;
    case '!=':
      result = rowVal !== cmpVal;
      break;
    case '>':
      result = Number(rowVal) > Number(cmpVal);
      break;
    case '<':
      result = Number(rowVal) < Number(cmpVal);
      break;
    case '>=':
      result = Number(rowVal) >= Number(cmpVal);
      break;
    case '<=':
      result = Number(rowVal) <= Number(cmpVal);
      break;
    case '~':
      try { result = new RegExp(cmpVal, 'i').test(rowVal); } catch { result = rowVal.includes(cmpVal); }
      break;
    case 'IN':
      result = Array.isArray(sc.value) ? (sc.value as unknown[]).map(String).includes(rowVal) : rowVal === cmpVal;
      break;
    case 'NOT IN':
      result = Array.isArray(sc.value) ? !(sc.value as unknown[]).map(String).includes(rowVal) : rowVal !== cmpVal;
      break;
    default:
      result = rowVal === cmpVal;
  }

  return sc.negate ? !result : result;
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
export async function getFields(
  // Accepted for API symmetry with the other discovery helpers. The field list
  // is schema-level (ClickHouse system.columns / a static SQLite list) and is
  // identical across indexes, so there is no per-index data to scope here.
  _allowedIndexes?: string[],
): Promise<{ name: string; type: string }[]> {
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
  limit: number = 100,
  allowedIndexes?: string[]
): Promise<{ value: string; count: number }[]> {
  const validFields = ['hostname', 'app_name', 'severity', 'facility', 'index_name', 'protocol'];
  if (!validFields.includes(field)) {
    throw new Error('Invalid field');
  }

  // Phase 5: read-side index scoping. A scoped key must only see values that
  // appear within its allowed indexes (null/empty allow-list = unscoped).
  const scope = indexScopeSqlClause(allowedIndexes);
  const whereClause = scope ? ` WHERE ${scope}` : '';

  if (isLiteMode()) {
    return sqliteLogs.executeQuery<{ value: string; count: number }>(
      `SELECT ${field} as value, COUNT(*) as count FROM logs${whereClause} GROUP BY ${field} ORDER BY count DESC LIMIT ${limit}`
    );
  }
  return clickhouse.executeQuery<{ value: string; count: number }>(
    `SELECT ${field} as value, count() as count FROM lognog.logs${whereClause} GROUP BY ${field} ORDER BY count DESC LIMIT ${limit}`
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
  allowedIndexes?: string[];
}): Promise<DiscoveredField[]> {
  const limit = options?.limit || 50;
  // Phase 5: read-side index scoping. ANDed into both the discovery query and
  // its per-field sample sub-queries so a scoped key cannot enumerate fields or
  // sample values from indexes outside its allow-list (null/empty = unscoped).
  const scope = indexScopeSqlClause(options?.allowedIndexes);

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

    // Add index filter. Validate against a strict identifier charset before
    // interpolation so a malicious index value cannot inject SQL (#37-10).
    if (options?.index) {
      if (!INDEX_NAME_RE.test(options.index)) {
        throw new Error(`Invalid index name: ${options.index}`);
      }
      sql += ` AND index_name = '${escapeSqlString(options.index)}'`;
    }

    // Phase 5: read-side index scoping
    if (scope) {
      sql += ` AND ${scope}`;
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
          ${scope ? `AND ${scope}` : ''}
        LIMIT 5
      `;
      try {
        // field.name is an attacker-controlled JSON key; single-quote escape it
        // before substituting into the literal (#37-10).
        const samples = await sqliteLogs.executeQuery<{ val: string }>(
          sampleSql.replace(/\?/g, `'${escapeSqlString(field.name)}'`)
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

    // Add index filter. Validate against a strict identifier charset, then use
    // proper single-quote-doubling escaping. The old `\\'` form is wrong for
    // ClickHouse string literals and breaks on a trailing backslash (#37-10).
    if (options?.index) {
      if (!INDEX_NAME_RE.test(options.index)) {
        throw new Error(`Invalid index name: ${options.index}`);
      }
      sql += ` AND index_name = '${escapeSqlString(options.index)}'`;
    }

    // Phase 5: read-side index scoping
    if (scope) {
      sql += ` AND ${scope}`;
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
        // field.name is an attacker-controlled JSON key returned by
        // JSONExtractKeys over structured_data. Escape it with single-quote
        // doubling (the old `\\'` form is wrong for ClickHouse and breaks on a
        // trailing backslash) so it cannot break out of the string literal and
        // inject SQL (#37-10).
        const safeName = escapeSqlString(field.name);
        const sampleSql = `
          SELECT
            JSONType(structured_data, '${safeName}') as type,
            groupUniqArray(5)(JSONExtractString(structured_data, '${safeName}')) as samples
          FROM lognog.logs
          WHERE structured_data != '{}'
            AND JSONHas(structured_data, '${safeName}')
            ${scope ? `AND ${scope}` : ''}
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
 * Get a single log entry by ID (for lazy loading full message content)
 */
export async function getLogById(
  id: string,
  fields: string[] = ['id', 'message', 'raw', 'message_truncated']
): Promise<Record<string, unknown> | null> {
  // Validate field names to prevent SQL injection
  const validFields = [
    'id', 'timestamp', 'received_at', 'hostname', 'app_name',
    'severity', 'facility', 'priority', 'message', 'raw',
    'message_truncated', 'structured_data', 'index_name', 'protocol',
    'source_ip', 'source_port'
  ];
  const safeFields = fields.filter(f => validFields.includes(f));
  if (safeFields.length === 0) {
    safeFields.push('message', 'raw', 'message_truncated');
  }

  if (isLiteMode()) {
    return sqliteLogs.getLogById(id, safeFields);
  }
  return clickhouse.getLogById(id, safeFields);
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
export async function getActiveSources(allowedIndexes?: string[]): Promise<ActiveSourcesResult> {
  // Phase 5: read-side index scoping. ANDed into the existing 7-day WHERE so a
  // scoped key only sees sources / indexes within its allow-list (null = unscoped).
  const scope = indexScopeSqlClause(allowedIndexes);
  const scopeAnd = scope ? ` AND ${scope}` : '';
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
      WHERE timestamp >= datetime('now', '-7 days')${scopeAnd}
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
      WHERE timestamp >= datetime('now', '-7 days')${scopeAnd}
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
      WHERE timestamp >= now() - INTERVAL 7 DAY${scopeAnd}
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
      WHERE timestamp >= now() - INTERVAL 7 DAY${scopeAnd}
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
