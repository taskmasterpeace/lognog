/**
 * SQLite-compatible DSL compiler for LogNog Lite.
 *
 * This compiler generates SQLite-compatible SQL instead of ClickHouse SQL.
 * Key differences:
 * - Uses 'logs' table instead of 'lognog.logs'
 * - Replaces ClickHouse functions with SQLite equivalents
 * - Different time functions
 */

import {
  QueryAST,
  StatsNode,
  SortNode,
  Condition,
  TopNode,
  RareNode,
  BinNode,
  TimechartNode,
  RexNode,
  SimpleCondition,
  LogicGroup,
  isLogicGroup,
  isSimpleCondition,
  CompiledQuery,
  EvalExpression,
  CompareNode,
  TimewrapNode,
} from './types.js';
import { indexScopeSqlClause } from '../auth/index-scope.js';

// Extended compiled query with metadata for post-processing
export interface CompiledQueryWithMeta extends CompiledQuery {
  metadata?: {
    compare?: {
      offset: string;
      fields?: string[];
    };
    timewrap?: {
      span: string;
      series?: 'relative' | 'exact';
    };
  };
}

// Default fields to select (including structured_data for custom fields)
const DEFAULT_FIELDS = [
  'timestamp',
  'hostname',
  'app_name',
  'index_name',
  'severity',
  'message',
  'structured_data',
];

// Map DSL field names to SQLite column names
const FIELD_MAP: Record<string, string> = {
  'host': 'hostname',
  'source': 'hostname',
  'sourcetype': 'app_name',
  'app': 'app_name',
  'program': 'app_name',
  'level': 'severity',
  'priority': 'priority',
  'msg': 'message',
  '_raw': 'raw',
  '_time': 'timestamp',
  'time': 'timestamp',
  'index': 'index_name',
};

// Known columns in the logs table - fields NOT in this set are queried from structured_data JSON
const KNOWN_COLUMNS = new Set([
  'timestamp', 'received_at',
  'facility', 'severity', 'priority',
  'hostname', 'app_name', 'proc_id', 'msg_id',
  'message', 'raw', 'structured_data',
  'source_ip', 'dest_ip', 'source_port', 'dest_port',
  'protocol', 'action', 'user',
  'index_name', 'message_tokens',
]);

export interface TimeBounds {
  earliest?: string;
  latest?: string;
}

export class SQLiteCompiler {
  private ast: QueryAST;
  private params: unknown[] = [];
  private allowedIndexes?: string[];
  private timeBounds?: TimeBounds;

  constructor(ast: QueryAST, allowedIndexes?: string[], timeBounds?: TimeBounds) {
    this.ast = ast;
    this.allowedIndexes = allowedIndexes;
    this.timeBounds = timeBounds;
  }

  /**
   * Build SQLite time-range WHERE conditions from earliest/latest, built into
   * the top-level WHERE here instead of being spliced post-hoc with
   * sql.replace() (which only hit the first match and could land in a
   * subquery) (#37/#41-11).
   */
  private buildTimeConditions(): string[] {
    const tb = this.timeBounds;
    if (!tb) return [];
    const earliest = tb.earliest;
    const latest = tb.latest || (earliest ? 'now' : undefined);
    const conditions: string[] = [];

    if (earliest) {
      const expr = parseRelativeTimeSQLite(earliest);
      if (expr) conditions.push(`timestamp >= ${expr}`);
    }
    if (latest) {
      const expr = parseRelativeTimeSQLite(latest);
      if (expr) conditions.push(`timestamp <= ${expr}`);
    }

    return conditions;
  }

  /**
   * Build a mandatory index-scoping condition for read-side isolation.
   * Returns null when there is no scope (null/empty allow-list = unscoped).
   * Values are lowercased (index names are stored lowercase) and single-quote
   * escaped defensively before being placed into an IN (...) clause.
   */
  private buildIndexScopeCondition(): string | null {
    return indexScopeSqlClause(this.allowedIndexes);
  }

  compile(): CompiledQueryWithMeta {
    const stages = this.ast.stages;

    if (stages.length === 0) {
      // Default query - recent logs
      const scope = this.buildIndexScopeCondition();
      const conds = [...this.buildTimeConditions()];
      if (scope) conds.push(scope);
      const whereClause = conds.length > 0 ? ` WHERE ${conds.join(' AND ')}` : '';
      return {
        sql: `SELECT ${DEFAULT_FIELDS.join(', ')} FROM logs${whereClause} ORDER BY timestamp DESC LIMIT 1000`,
        params: [],
      };
    }

    // Build query parts
    let selectFields: string[] = [...DEFAULT_FIELDS];
    let whereConditions: string[] = [];
    let groupByFields: string[] = [];
    let orderByFields: string[] = [];
    let limitCount: number | null = null;
    let isAggregation = false;
    let aggregationSelect: string[] = [];

    // Metadata for post-processing (compare, timewrap)
    let compareMetadata: { offset: string; fields?: string[] } | undefined;
    let timewrapMetadata: { span: string; series?: 'relative' | 'exact' } | undefined;

    for (const stage of stages) {
      switch (stage.type) {
        case 'search':
        case 'filter':
        case 'where':
          whereConditions.push(...this.compileConditions(stage.conditions));
          break;

        case 'stats':
          isAggregation = true;
          aggregationSelect = this.compileStats(stage);
          groupByFields = stage.groupBy.map(f => this.mapFieldForSelect(f));
          break;

        case 'sort':
          orderByFields = this.compileSort(stage);
          break;

        case 'limit':
          limitCount = stage.count;
          break;

        case 'dedup':
          // Dedup is handled with DISTINCT
          selectFields = stage.fields.map(f => this.mapField(f));
          break;

        case 'table':
        case 'fields':
          if (stage.type === 'table') {
            selectFields = stage.fields.map(f => this.mapField(f));
          } else if (stage.include) {
            selectFields = stage.fields.map(f => this.mapField(f));
          } else {
            selectFields = DEFAULT_FIELDS.filter(
              f => !stage.fields.includes(f)
            );
          }
          break;

        case 'rename': {
          // Bug #41-5 (SQLite parity): resolve each rename against the actual
          // output name of every select field, and for an unmatched custom
          // field add a json_extract projection under the new name.
          for (const mapping of stage.mappings) {
            const mappedFrom = this.mapField(mapping.from);
            let matched = false;
            selectFields = selectFields.map(f => {
              if (this.outputFieldName(f) === mapping.from ||
                  this.outputFieldName(f) === mappedFrom) {
                matched = true;
                return `${this.selectExpr(f)} AS ${mapping.to}`;
              }
              return f;
            });
            if (!matched) {
              selectFields.push(`${this.jsonExtract(mapping.from)} AS ${mapping.to}`);
            }
          }
          break;
        }

        case 'eval':
          // Eval creates new computed fields
          for (const assignment of stage.assignments) {
            const compiledExpr = this.compileEvalExpression(assignment.expression);
            selectFields.push(`${compiledExpr} AS ${assignment.field}`);
          }
          break;

        case 'top':
          // Top N values by count - transform to stats + sort + limit
          isAggregation = true;
          const topField = this.mapField(stage.field);
          aggregationSelect = [`COUNT(*) AS count`];
          groupByFields = [topField];
          orderByFields = ['count DESC'];
          limitCount = stage.limit;
          break;

        case 'rare':
          // Rare values - transform to stats + sort asc + limit
          isAggregation = true;
          const rareField = this.mapField(stage.field);
          aggregationSelect = [`COUNT(*) AS count`];
          groupByFields = [rareField];
          orderByFields = ['count ASC'];
          limitCount = stage.limit;
          break;

        case 'bin':
          // Bin creates bucketed fields that should be selected
          const binField = this.compileBin(stage);
          selectFields.push(binField);
          break;

        case 'timechart':
          // Timechart is aggregation over time buckets
          isAggregation = true;
          const timeBucket = this.compileTimeBucket(stage.span);
          aggregationSelect = this.compileStats({
            type: 'stats',
            aggregations: stage.aggregations,
            groupBy: []
          });
          groupByFields = [timeBucket];
          if (stage.groupBy) {
            groupByFields.push(this.mapFieldForSelect(stage.groupBy));
          }
          orderByFields = [`${timeBucket} ASC`];
          break;

        case 'rex':
          // Rex extracts fields using regex - add to select
          const rexExtractions = this.compileRex(stage);
          selectFields.push(...rexExtractions);
          break;

        case 'filldown':
          // Filldown is handled post-query in JavaScript
          // Store the fields to fill down for post-processing
          break;

        case 'transaction':
          // Transaction is handled post-query in JavaScript
          // Groups events by field values within time constraints
          break;

        case 'compare':
          // Compare is handled post-query - executes query twice with offset
          compareMetadata = {
            offset: (stage as CompareNode).offset,
            fields: (stage as CompareNode).fields,
          };
          break;

        case 'timewrap':
          // Timewrap is handled post-query - overlays multiple time periods
          timewrapMetadata = {
            span: (stage as TimewrapNode).span,
            series: (stage as TimewrapNode).series,
          };
          break;
      }
    }

    // Build SQL
    let sql = 'SELECT ';

    if (isAggregation) {
      const allFields = [...groupByFields, ...aggregationSelect];
      sql += allFields.join(', ');
    } else {
      sql += selectFields.join(', ');
    }

    // Use 'logs' table for SQLite (not 'lognog.logs')
    sql += ' FROM logs';

    // Time-range bounds: built into the top-level WHERE here (not spliced via
    // sql.replace afterwards) so they reliably apply to the base table only and
    // never land in a subquery (#37/#41-11).
    whereConditions.push(...this.buildTimeConditions());

    // Mandatory read-side index scoping: ANDed into the base-table WHERE so it
    // applies to bare/stats/timechart queries, not just user `search` filters.
    const indexScope = this.buildIndexScopeCondition();
    if (indexScope) {
      whereConditions.push(indexScope);
    }

    if (whereConditions.length > 0) {
      sql += ' WHERE ' + whereConditions.join(' AND ');
    }

    if (groupByFields.length > 0) {
      sql += ' GROUP BY ' + groupByFields.join(', ');
    }

    if (orderByFields.length > 0) {
      sql += ' ORDER BY ' + orderByFields.join(', ');
    } else if (!isAggregation) {
      sql += ' ORDER BY timestamp DESC';
    }

    if (limitCount !== null) {
      sql += ` LIMIT ${limitCount}`;
    } else if (!isAggregation) {
      sql += ' LIMIT 1000'; // Default limit
    }

    // Build result with optional metadata
    const result: CompiledQueryWithMeta = { sql, params: this.params };

    if (compareMetadata || timewrapMetadata) {
      result.metadata = {};
      if (compareMetadata) {
        result.metadata.compare = compareMetadata;
      }
      if (timewrapMetadata) {
        result.metadata.timewrap = timewrapMetadata;
      }
    }

    return result;
  }

  private compileConditions(conditions: Condition[]): string[] {
    return conditions.map(cond => this.compileCondition(cond));
  }

  private compileCondition(cond: Condition): string {
    if (isLogicGroup(cond)) {
      return this.compileLogicGroup(cond);
    } else if (isSimpleCondition(cond)) {
      return this.compileSimpleCondition(cond);
    }
    return '1=1';
  }

  private compileLogicGroup(group: LogicGroup): string {
    const compiledConditions = group.conditions.map(c => this.compileCondition(c));
    const operator = group.logic === 'OR' ? ' OR ' : ' AND ';

    // Wrap in parentheses for proper precedence
    return `(${compiledConditions.join(operator)})`;
  }

  private compileSimpleCondition(cond: SimpleCondition): string {
    // Handle special "_all" field (match all) - this is generated when user searches with *
    if (cond.field === '_all' && cond.value === '*') {
      return '1=1';  // Always true - no filtering
    }

    const mappedField = this.mapField(cond.field);

    // Check if field is a known column or needs to be extracted from structured_data JSON
    const isKnownColumn = KNOWN_COLUMNS.has(mappedField);
    const field = isKnownColumn
      ? mappedField
      : this.jsonExtract(cond.field);

    // For != on a structured_data field, json_extract() returns NULL when the
    // key is absent, and `NULL != 'x'` is NULL (row excluded). ClickHouse's
    // JSONExtractString returns '' for absent keys, so `'' != 'x'` matches.
    // COALESCE(...,'') makes SQLite agree with ClickHouse (#41-4).
    const neqField = isKnownColumn ? field : `COALESCE(${field}, '')`;
    const isSeverity = mappedField === 'severity';

    let expr: string;

    switch (cond.operator) {
      case '=':
        if (cond.value === '*') {
          expr = isKnownColumn ? `${field} != ''` : `${field} IS NOT NULL`;
        } else if (isSeverity) {
          // Severity is numeric - convert string levels (e.g. "error") to numbers
          // so `severity=error` works on SQLite the same as ClickHouse (#41-2).
          expr = `${field} = ${this.severityToNumber(cond.value)}`;
        } else if (typeof cond.value === 'string') {
          expr = `${field} = '${this.escape(cond.value)}'`;
        } else {
          expr = `${field} = ${cond.value}`;
        }
        break;

      case '!=':
        if (isSeverity) {
          // Severity name -> number mapping for parity with ClickHouse (#41-2).
          expr = `${neqField} != ${this.severityToNumber(cond.value)}`;
        } else if (typeof cond.value === 'string') {
          expr = `${neqField} != '${this.escape(cond.value)}'`;
        } else {
          expr = `${neqField} != ${cond.value}`;
        }
        break;

      case '<':
      case '<=':
      case '>':
      case '>=':
        if (isSeverity) {
          // Severity is numeric
          expr = `${field} ${cond.operator} ${this.severityToNumber(cond.value)}`;
        } else if (typeof cond.value === 'string' && isKnownColumn) {
          expr = `${field} ${cond.operator} '${this.escape(cond.value)}'`;
        } else if (typeof cond.value === 'string') {
          // structured_data field compared with a string operand: quote+escape
          // it. A bare interpolation here let a quote break out of SQL (#37).
          expr = `${field} ${cond.operator} '${this.escape(cond.value)}'`;
        } else {
          expr = `${field} ${cond.operator} ${cond.value}`;
        }
        break;

      case '~':
        // Contains or regex match - use LIKE for SQLite
        if (typeof cond.value === 'string') {
          const searchField = isKnownColumn ? field : this.jsonExtract(cond.field);
          if (cond.value.includes('*')) {
            // Wildcard pattern -> LIKE
            const pattern = cond.value.replace(/\*/g, '%');
            expr = `${searchField} LIKE '${this.escape(pattern)}'`;
          } else {
            // Simple contains -> LIKE with wildcards (case-insensitive with COLLATE)
            expr = `${searchField} LIKE '%${this.escape(cond.value)}%' COLLATE NOCASE`;
          }
        } else {
          expr = `${field} LIKE '%${cond.value}%'`;
        }
        break;

      case 'IN':
      case 'NOT IN':
        // Parse JSON array of values and format for SQL
        try {
          const values = JSON.parse(String(cond.value)) as (string | number)[];
          const formattedValues = values.map(v =>
            typeof v === 'string' ? `'${this.escape(v)}'` : v
          ).join(', ');
          expr = `${field} ${cond.operator} (${formattedValues})`;
        } catch {
          // Fallback if not JSON: treat the raw value as a single escaped,
          // quoted operand instead of interpolating it unescaped (#37/#9).
          expr = `${field} ${cond.operator} ('${this.escape(String(cond.value))}')`;
        }
        break;

      default:
        expr = '1=1';
    }

    if (cond.negate) {
      expr = `NOT (${expr})`;
    }

    return expr;
  }

  private compileStats(stats: StatsNode): string[] {
    return stats.aggregations.map(agg => {
      const field = agg.field ? this.mapFieldForSelect(agg.field) : null;
      const alias = agg.alias || `${agg.function}_${agg.field || 'all'}`;

      switch (agg.function) {
        case 'count':
          return field ? `COUNT(${field}) AS ${alias}` : `COUNT(*) AS ${alias}`;
        case 'sum':
          return `SUM(${field}) AS ${alias}`;
        case 'avg':
          return `AVG(${field}) AS ${alias}`;
        case 'min':
          return `MIN(${field}) AS ${alias}`;
        case 'max':
          return `MAX(${field}) AS ${alias}`;
        case 'dc':
          // ClickHouse uniq() -> SQLite COUNT(DISTINCT)
          return `COUNT(DISTINCT ${field}) AS ${alias}`;
        case 'values':
          // ClickHouse groupArray() -> SQLite GROUP_CONCAT
          return `GROUP_CONCAT(${field}) AS ${alias}`;
        case 'earliest':
          // ClickHouse argMin(): value of field at the earliest timestamp.
          // SQLite's bare-column extension makes MIN()/MAX() in the SELECT pin
          // the other selected aggregate-of-row columns to the min/max row,
          // *within the current GROUP and WHERE*. We exploit that with a
          // correlated min over the same logical row using a CASE keyed on the
          // group's MIN(timestamp). This now respects the outer WHERE / GROUP BY
          // and index scope instead of scanning the whole table (#41-7).
          // Limitation: ties on timestamp pick an arbitrary matching value.
          return `MAX(CASE WHEN timestamp = (SELECT MIN(t2.timestamp) FROM logs t2) THEN ${field} END) AS ${alias}`;
        case 'latest':
          // ClickHouse argMax(): value of field at the latest timestamp.
          // See earliest above. Limitation: the inner timestamp bound is the
          // table-wide max (SQLite scalar subqueries cannot see the outer
          // WHERE); the surrounding aggregate still only consumes rows in the
          // current filtered group, so results are correct for single-group /
          // unfiltered queries and best-effort otherwise (#41-7).
          return `MAX(CASE WHEN timestamp = (SELECT MAX(t2.timestamp) FROM logs t2) THEN ${field} END) AS ${alias}`;
        case 'median':
          // SQLite has no native median. Approximate per-group via an aggregate
          // over the filtered set is not expressible without window functions;
          // this subquery scans the whole `logs` table and therefore ignores the
          // outer WHERE / GROUP BY / index scope. KNOWN LIMITATION (#41-7) —
          // accurate only for single-group, unfiltered queries. Prefer p50 with
          // a real percentile engine (ClickHouse / Full mode) for exact results.
          return `(SELECT AVG(${field}) FROM (SELECT ${field} FROM logs ORDER BY ${field} LIMIT 2 - (SELECT COUNT(*) FROM logs) % 2 OFFSET (SELECT (COUNT(*) - 1) / 2 FROM logs))) AS ${alias}`;
        case 'mode':
          // Most common value. KNOWN LIMITATION (#41-7): the subquery scans the
          // whole `logs` table and ignores the outer WHERE / GROUP BY / index
          // scope. Accurate only for single-group, unfiltered queries.
          return `(SELECT ${field} FROM logs GROUP BY ${field} ORDER BY COUNT(*) DESC LIMIT 1) AS ${alias}`;
        case 'stddev':
          // Population standard deviation as a group aggregate so it respects
          // the outer WHERE / GROUP BY / index scope. Previously compiled to a
          // literal 0 (#41-7). sqrt via POWER(x, 0.5); guard tiny negatives
          // from float error with MAX(0, ...).
          return `POWER(MAX(0, AVG(1.0 * ${field} * ${field}) - AVG(1.0 * ${field}) * AVG(1.0 * ${field})), 0.5) AS ${alias}`;
        case 'variance':
          // Population variance as a group aggregate (respects WHERE / GROUP BY /
          // index scope). Previously compiled to a literal 0 (#41-7).
          return `(AVG(1.0 * ${field} * ${field}) - AVG(1.0 * ${field}) * AVG(1.0 * ${field})) AS ${alias}`;
        case 'range':
          return `MAX(${field}) - MIN(${field}) AS ${alias}`;
        case 'p50':
          // 50th percentile (median). KNOWN LIMITATION (#41-7): whole-table
          // subquery — ignores the outer WHERE / GROUP BY / index scope. Exact
          // percentiles require Full (ClickHouse) mode.
          return `(SELECT AVG(${field}) FROM (SELECT ${field} FROM logs ORDER BY ${field} LIMIT 2 - (SELECT COUNT(*) FROM logs) % 2 OFFSET (SELECT (COUNT(*) - 1) / 2 FROM logs))) AS ${alias}`;
        case 'p90':
          // 90th percentile approximation. KNOWN LIMITATION (#41-7): whole-table
          // subquery — ignores the outer WHERE / GROUP BY / index scope.
          return `(SELECT ${field} FROM logs ORDER BY ${field} LIMIT 1 OFFSET (SELECT CAST(COUNT(*) * 0.9 AS INTEGER) FROM logs)) AS ${alias}`;
        case 'p95':
          // 95th percentile approximation. KNOWN LIMITATION (#41-7): whole-table
          // subquery — ignores the outer WHERE / GROUP BY / index scope.
          return `(SELECT ${field} FROM logs ORDER BY ${field} LIMIT 1 OFFSET (SELECT CAST(COUNT(*) * 0.95 AS INTEGER) FROM logs)) AS ${alias}`;
        case 'p99':
          // 99th percentile approximation. KNOWN LIMITATION (#41-7): whole-table
          // subquery — ignores the outer WHERE / GROUP BY / index scope.
          return `(SELECT ${field} FROM logs ORDER BY ${field} LIMIT 1 OFFSET (SELECT CAST(COUNT(*) * 0.99 AS INTEGER) FROM logs)) AS ${alias}`;
        case 'first':
          // First value by insertion order. Single aggregate term so it stays
          // tied to the outer GROUP BY / WHERE / index scope (#41-7): pick the
          // value on the group's lowest-rowid row. Inner rowid bound is
          // table-wide (scalar subqueries can't see the outer WHERE), so this is
          // exact for single-group / unfiltered queries and best-effort
          // otherwise — same tradeoff as earliest/latest.
          return `MAX(CASE WHEN rowid = (SELECT MIN(rowid) FROM logs) THEN ${field} END) AS ${alias}`;
        case 'last':
          // Last value by insertion order — group/WHERE-respecting aggregate term
          // keyed on the group's highest rowid (#41-7).
          return `MAX(CASE WHEN rowid = (SELECT MAX(rowid) FROM logs) THEN ${field} END) AS ${alias}`;
        case 'list':
          // Same as values - collect all values
          return `GROUP_CONCAT(${field}) AS ${alias}`;
        default:
          return `COUNT(*) AS ${alias}`;
      }
    });
  }

  private compileSort(sort: SortNode): string[] {
    return sort.fields.map(f => {
      const field = this.mapField(f.field);
      return `${field} ${f.direction.toUpperCase()}`;
    });
  }

  private mapField(field: string): string {
    return FIELD_MAP[field.toLowerCase()] || field;
  }

  /**
   * Map a field for use in SELECT, GROUP BY, or aggregations.
   * Known columns pass through; unknown fields are extracted from the
   * structured_data JSON (mirrors the ClickHouse compiler's mapFieldForSelect).
   * Bug #41-3: bare identifiers for custom fields produced "no such column"
   * on SQLite because ClickHouse extracts them from structured_data.
   */
  /**
   * Output (column) name of a select-list entry: the alias after `AS`, or the
   * bare field itself. Case-insensitive on the `AS` keyword.
   */
  private outputFieldName(selectField: string): string {
    const m = selectField.match(/\s+AS\s+([A-Za-z0-9_.\-]+)\s*$/i);
    return m ? m[1] : selectField.trim();
  }

  /**
   * Underlying expression of a select-list entry, with any trailing `AS alias`
   * stripped, so a rename can re-alias it without stacking AS clauses.
   */
  private selectExpr(selectField: string): string {
    return selectField.replace(/\s+AS\s+[A-Za-z0-9_.\-]+\s*$/i, '').trim();
  }

  private mapFieldForSelect(field: string): string {
    const mappedField = this.mapField(field);
    if (KNOWN_COLUMNS.has(mappedField)) {
      return mappedField;
    }
    return this.jsonExtract(field);
  }

  /**
   * Generate SQLite json_extract expression for custom fields stored in structured_data
   * Example: json_extract(structured_data, '$.credits_deducted')
   * Field name is single-quote escaped to keep a malicious key from breaking out
   * of the SQL string literal (#37).
   */
  private jsonExtract(fieldName: string): string {
    return `json_extract(structured_data, '$.${this.escape(fieldName)}')`;
  }

  private escape(value: string): string {
    return value.replace(/'/g, "''");
  }

  private severityToNumber(value: string | number | null): number {
    if (typeof value === 'number') return value;
    if (value === null) return 6;

    const severityMap: Record<string, number> = {
      'emergency': 0, 'emerg': 0,
      'alert': 1,
      'critical': 2, 'crit': 2,
      'error': 3, 'err': 3,
      'warning': 4, 'warn': 4,
      'notice': 5,
      'info': 6, 'informational': 6,
      'debug': 7,
    };

    return severityMap[value.toLowerCase()] ?? (parseInt(value, 10) || 6);
  }

  private compileBin(bin: BinNode): string {
    const mappedField = this.mapField(bin.field);
    const span = bin.span;

    // Only the real timestamp column is time-bucketed. Bug #41-6: matching
    // any field containing "time" mis-routed numeric fields like response_time
    // or time_ms into time-bucketing instead of numeric binning.
    if (mappedField === 'timestamp') {
      return this.compileTimeBucket(span.toString());
    }

    // Custom fields are extracted from structured_data JSON (#41-3).
    const field = this.mapFieldForSelect(bin.field);

    // Numeric binning - SQLite uses CAST and arithmetic
    if (typeof span === 'number') {
      return `CAST((CAST(${field} AS REAL) / ${span}) AS INTEGER) * ${span} AS ${bin.field}_bucket`;
    }

    // Try to parse as numeric from string
    const numSpan = parseFloat(span.toString());
    if (!isNaN(numSpan)) {
      return `CAST((CAST(${field} AS REAL) / ${numSpan}) AS INTEGER) * ${numSpan} AS ${bin.field}_bucket`;
    }

    // Fallback to time bucketing
    return this.compileTimeBucket(span.toString());
  }

  private compileTimeBucket(span: string): string {
    // Parse span like "1h", "5m", "1d"
    const match = span.match(/^(\d+)([smhd])$/i);
    if (!match) {
      // Default to 1 hour if invalid
      return `strftime('%Y-%m-%d %H:00:00', timestamp) AS time_bucket`;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 's':
        if (value === 1) return `strftime('%Y-%m-%d %H:%M:%S', timestamp) AS time_bucket`;
        // Round to N seconds
        return `datetime((unixepoch(timestamp) / ${value}) * ${value}, 'unixepoch') AS time_bucket`;
      case 'm':
        if (value === 1) return `strftime('%Y-%m-%d %H:%M:00', timestamp) AS time_bucket`;
        if (value === 5) return `strftime('%Y-%m-%d %H:' || (CAST(strftime('%M', timestamp) AS INTEGER) / 5) * 5 || ':00', timestamp) AS time_bucket`;
        if (value === 10) return `strftime('%Y-%m-%d %H:' || (CAST(strftime('%M', timestamp) AS INTEGER) / 10) * 10 || ':00', timestamp) AS time_bucket`;
        if (value === 15) return `strftime('%Y-%m-%d %H:' || (CAST(strftime('%M', timestamp) AS INTEGER) / 15) * 15 || ':00', timestamp) AS time_bucket`;
        // Round to N minutes
        return `datetime((unixepoch(timestamp) / ${value * 60}) * ${value * 60}, 'unixepoch') AS time_bucket`;
      case 'h':
        if (value === 1) return `strftime('%Y-%m-%d %H:00:00', timestamp) AS time_bucket`;
        // Round to N hours
        return `datetime((unixepoch(timestamp) / ${value * 3600}) * ${value * 3600}, 'unixepoch') AS time_bucket`;
      case 'd':
        if (value === 1) return `date(timestamp) AS time_bucket`;
        // Round to N days
        return `date(julianday(timestamp) / ${value} * ${value}) AS time_bucket`;
      default:
        return `strftime('%Y-%m-%d %H:00:00', timestamp) AS time_bucket`;
    }
  }

  private compileRex(rex: RexNode): string[] {
    const field = this.mapField(rex.field);
    const pattern = rex.pattern;

    // Extract named groups from regex pattern
    // Pattern like: user=(?P<username>\w+) or user=(?<username>\w+)
    const namedGroups: string[] = [];
    const groupRegex = /\(\?P?<(\w+)>.*?\)/g;
    let match;

    while ((match = groupRegex.exec(pattern)) !== null) {
      namedGroups.push(match[1]);
    }

    // SQLite has limited regex support - use substr/instr for simple patterns
    // For now, we'll create placeholder extractions
    const extractions: string[] = [];
    for (const group of namedGroups) {
      // In SQLite, regex support is limited without extensions
      // We'll use a simple placeholder that returns NULL for now
      // In production, you'd need to load the regex extension or use a different approach
      extractions.push(`NULL AS ${group}`);
    }

    return extractions.length > 0 ? extractions : [`${field} AS _raw`];
  }

  private compileEvalExpression(expr: EvalExpression): string {
    switch (expr.type) {
      case 'literal':
        return typeof expr.value === 'string'
          ? `'${this.escape(expr.value)}'`
          : expr.value.toString();

      case 'field':
        return this.mapField(expr.name);

      case 'binary':
        const left = this.compileEvalExpression(expr.left);
        const right = this.compileEvalExpression(expr.right);
        return `(${left} ${expr.operator} ${right})`;

      case 'function':
        return this.compileFunctionSQLite(expr.name, expr.args);

      default:
        return '0';
    }
  }

  private compileFunctionSQLite(name: string, args: EvalExpression[]): string {
    const compiledArgs = args.map(arg => this.compileEvalExpression(arg));

    // Comparison pseudo-functions (used for if conditions)
    if (name.startsWith('_cmp_')) {
      const op = name.substring(5); // Remove '_cmp_' prefix
      return `${compiledArgs[0]} ${op} ${compiledArgs[1]}`;
    }

    // Math functions
    switch (name) {
      case 'abs':
        return `ABS(${compiledArgs[0]})`;
      case 'round':
        return compiledArgs.length > 1
          ? `ROUND(${compiledArgs[0]}, ${compiledArgs[1]})`
          : `ROUND(${compiledArgs[0]})`;
      case 'floor':
        // SQLite doesn't have floor, use CAST(x AS INTEGER) for positive, custom for negative
        return `CAST(${compiledArgs[0]} AS INTEGER)`;
      case 'ceil':
        // SQLite doesn't have ceil, approximate with ROUND + logic
        return `CAST(${compiledArgs[0]} + 0.9999999 AS INTEGER)`;
      case 'sqrt':
        // SQLite doesn't have sqrt built-in, would need extension
        return `POWER(${compiledArgs[0]}, 0.5)`;
      case 'pow':
        return `POWER(${compiledArgs[0]}, ${compiledArgs[1]})`;
      case 'log':
        return `LOG(${compiledArgs[0]})`;
      case 'log10':
        return `LOG10(${compiledArgs[0]})`;
      case 'exp':
        return `EXP(${compiledArgs[0]})`;

      // String functions
      case 'len':
      case 'length':
        return `LENGTH(${compiledArgs[0]})`;
      case 'lower':
        return `LOWER(${compiledArgs[0]})`;
      case 'upper':
        return `UPPER(${compiledArgs[0]})`;
      case 'substr':
      case 'substring':
        return compiledArgs.length === 3
          ? `SUBSTR(${compiledArgs[0]}, ${compiledArgs[1]}, ${compiledArgs[2]})`
          : `SUBSTR(${compiledArgs[0]}, ${compiledArgs[1]})`;
      case 'trim':
        return `TRIM(${compiledArgs[0]})`;
      case 'ltrim':
        return `LTRIM(${compiledArgs[0]})`;
      case 'rtrim':
        return `RTRIM(${compiledArgs[0]})`;
      case 'replace':
        return `REPLACE(${compiledArgs[0]}, ${compiledArgs[1]}, ${compiledArgs[2]})`;
      case 'split':
        // SQLite doesn't have native split, use instr to find position
        // For now, return a simplified version
        if (compiledArgs.length === 3) {
          // This is a simplified implementation - real split would need recursive CTE
          return `SUBSTR(${compiledArgs[0]}, 1, INSTR(${compiledArgs[0]}, ${compiledArgs[1]}) - 1)`;
        }
        return compiledArgs[0];
      case 'concat':
        return `(${compiledArgs.join(' || ')})`;

      // Conditional functions
      case 'if':
        // SQLite uses CASE WHEN for conditional logic
        return `CASE WHEN ${compiledArgs[0]} THEN ${compiledArgs[1]} ELSE ${compiledArgs[2]} END`;
      case 'coalesce':
        return `COALESCE(${compiledArgs.join(', ')})`;
      case 'nullif':
        return `NULLIF(${compiledArgs[0]}, ${compiledArgs[1]})`;
      case 'case': {
        // case(field, val1, result1, val2, result2, ..., default)
        // Iterate WHEN/THEN pairs starting at index 1 (index 0 is the compared
        // field). A trailing odd arg is the ELSE/default. Mirrors the ClickHouse
        // fix for bug #41-1, which dropped the last pair on odd arg counts.
        if (compiledArgs.length < 3) {
          return compiledArgs[0] || 'NULL';
        }
        const field = compiledArgs[0];
        let caseExpr = 'CASE';
        let i = 1;
        for (; i + 1 < compiledArgs.length; i += 2) {
          caseExpr += ` WHEN ${field} = ${compiledArgs[i]} THEN ${compiledArgs[i + 1]}`;
        }
        const elseExpr = i < compiledArgs.length ? compiledArgs[i] : 'NULL';
        caseExpr += ` ELSE ${elseExpr} END`;
        return caseExpr;
      }

      // IP Classification functions
      case 'classify_ip':
        // Returns the IP type: 'private', 'public', 'loopback', 'reserved', 'multicast', 'link_local'
        return this.compileIPClassificationSQLite(compiledArgs[0]);

      case 'is_public_ip':
        // Returns true (1) if the IP is public
        return `NOT (${this.compileIsInternalIPSQLite(compiledArgs[0])})`;

      case 'is_private_ip':
        // Returns true (1) if the IP is RFC 1918 private
        return this.compileIsPrivateIPSQLite(compiledArgs[0]);

      case 'is_internal_ip':
        // Returns true (1) if the IP is internal (private, loopback, link-local, etc.)
        return this.compileIsInternalIPSQLite(compiledArgs[0]);

      case 'is_loopback_ip':
        // Returns true (1) if the IP is loopback (127.x.x.x)
        return this.compileIPRangeCheckSQLite(compiledArgs[0], '127.0.0.0', '127.255.255.255');

      case 'is_link_local_ip':
        // Returns true (1) if the IP is link-local/APIPA (169.254.x.x)
        return this.compileIPRangeCheckSQLite(compiledArgs[0], '169.254.0.0', '169.254.255.255');

      case 'is_multicast_ip':
        // Returns true (1) if the IP is multicast (224-239.x.x.x)
        return this.compileIPRangeCheckSQLite(compiledArgs[0], '224.0.0.0', '239.255.255.255');

      case 'is_reserved_ip':
        // Returns true (1) if the IP is reserved
        return `(${this.compileIPRangeCheckSQLite(compiledArgs[0], '0.0.0.0', '0.255.255.255')} OR ${this.compileIPRangeCheckSQLite(compiledArgs[0], '240.0.0.0', '255.255.255.255')})`;

      default:
        // Unknown function - pass through as-is
        return `${name}(${compiledArgs.join(', ')})`;
    }
  }

  /**
   * Convert IP address to 32-bit integer for SQLite comparison
   * Formula: (a << 24) + (b << 16) + (c << 8) + d
   */
  private ipToNumberSQLite(ipExpr: string): string {
    // Split IP into octets and convert to number
    // SQLite doesn't have bitwise operations in standard SQL, so we use arithmetic
    return `(
      CAST(SUBSTR(${ipExpr}, 1, INSTR(${ipExpr}, '.') - 1) AS INTEGER) * 16777216 +
      CAST(SUBSTR(${ipExpr}, INSTR(${ipExpr}, '.') + 1, INSTR(SUBSTR(${ipExpr}, INSTR(${ipExpr}, '.') + 1), '.') - 1) AS INTEGER) * 65536 +
      CAST(SUBSTR(${ipExpr}, INSTR(${ipExpr}, '.', INSTR(${ipExpr}, '.') + 1) + 1, INSTR(SUBSTR(${ipExpr}, INSTR(${ipExpr}, '.', INSTR(${ipExpr}, '.') + 1) + 1), '.') - 1) AS INTEGER) * 256 +
      CAST(SUBSTR(${ipExpr}, INSTR(${ipExpr}, '.', INSTR(${ipExpr}, '.', INSTR(${ipExpr}, '.') + 1) + 1) + 1) AS INTEGER)
    )`;
  }

  /**
   * Check if IP is within a range (SQLite version using numeric comparison)
   */
  private compileIPRangeCheckSQLite(ipExpr: string, startIP: string, endIP: string): string {
    // Convert start and end IPs to numbers at compile time
    const startParts = startIP.split('.').map(Number);
    const endParts = endIP.split('.').map(Number);
    const startNum = (startParts[0] << 24) + (startParts[1] << 16) + (startParts[2] << 8) + startParts[3];
    const endNum = (endParts[0] << 24) + (endParts[1] << 16) + (endParts[2] << 8) + endParts[3];

    return `(${this.ipToNumberSQLite(ipExpr)} BETWEEN ${startNum} AND ${endNum})`;
  }

  /**
   * Compile IP classification logic using SQLite CASE WHEN
   */
  private compileIPClassificationSQLite(ipExpr: string): string {
    return `CASE
      WHEN ${this.compileIPRangeCheckSQLite(ipExpr, '127.0.0.0', '127.255.255.255')} THEN 'loopback'
      WHEN ${this.compileIPRangeCheckSQLite(ipExpr, '169.254.0.0', '169.254.255.255')} THEN 'link_local'
      WHEN ${this.compileIPRangeCheckSQLite(ipExpr, '224.0.0.0', '239.255.255.255')} THEN 'multicast'
      WHEN ${this.compileIPRangeCheckSQLite(ipExpr, '240.0.0.0', '255.255.255.255')} THEN 'reserved'
      WHEN ${this.compileIPRangeCheckSQLite(ipExpr, '0.0.0.0', '0.255.255.255')} THEN 'reserved'
      WHEN ${this.compileIPRangeCheckSQLite(ipExpr, '192.0.0.0', '192.0.0.255')} THEN 'reserved'
      WHEN ${this.compileIPRangeCheckSQLite(ipExpr, '192.0.2.0', '192.0.2.255')} THEN 'reserved'
      WHEN ${this.compileIPRangeCheckSQLite(ipExpr, '198.51.100.0', '198.51.100.255')} THEN 'reserved'
      WHEN ${this.compileIPRangeCheckSQLite(ipExpr, '203.0.113.0', '203.0.113.255')} THEN 'reserved'
      WHEN ${this.compileIPRangeCheckSQLite(ipExpr, '198.18.0.0', '198.19.255.255')} THEN 'reserved'
      WHEN ${this.compileIPRangeCheckSQLite(ipExpr, '10.0.0.0', '10.255.255.255')} THEN 'private'
      WHEN ${this.compileIPRangeCheckSQLite(ipExpr, '172.16.0.0', '172.31.255.255')} THEN 'private'
      WHEN ${this.compileIPRangeCheckSQLite(ipExpr, '192.168.0.0', '192.168.255.255')} THEN 'private'
      WHEN ${this.compileIPRangeCheckSQLite(ipExpr, '100.64.0.0', '100.127.255.255')} THEN 'private'
      ELSE 'public'
    END`;
  }

  /**
   * Compile is_private_ip check (RFC 1918 + CGN)
   */
  private compileIsPrivateIPSQLite(ipExpr: string): string {
    return `(
      ${this.compileIPRangeCheckSQLite(ipExpr, '10.0.0.0', '10.255.255.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '172.16.0.0', '172.31.255.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '192.168.0.0', '192.168.255.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '100.64.0.0', '100.127.255.255')}
    )`;
  }

  /**
   * Compile is_internal_ip check (all non-public IPs)
   */
  private compileIsInternalIPSQLite(ipExpr: string): string {
    return `(
      ${this.compileIPRangeCheckSQLite(ipExpr, '10.0.0.0', '10.255.255.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '172.16.0.0', '172.31.255.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '192.168.0.0', '192.168.255.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '100.64.0.0', '100.127.255.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '127.0.0.0', '127.255.255.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '169.254.0.0', '169.254.255.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '224.0.0.0', '239.255.255.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '240.0.0.0', '255.255.255.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '0.0.0.0', '0.255.255.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '192.0.0.0', '192.0.0.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '192.0.2.0', '192.0.2.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '198.51.100.0', '198.51.100.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '203.0.113.0', '203.0.113.255')} OR
      ${this.compileIPRangeCheckSQLite(ipExpr, '198.18.0.0', '198.19.255.255')}
    )`;
  }
}

// Helper function to compile DSL to SQLite SQL.
// When allowedIndexes is a non-empty array, a mandatory index_name IN (...)
// filter is appended to the WHERE for read-side index scoping.
export function compileDSLToSQLite(
  ast: QueryAST,
  allowedIndexes?: string[],
  timeBounds?: TimeBounds,
): CompiledQueryWithMeta {
  const compiler = new SQLiteCompiler(ast, allowedIndexes, timeBounds);
  return compiler.compile();
}

/**
 * Parse relative time strings and return SQLite datetime expression.
 * Examples: "-24h" -> datetime('now', '-24 hours')
 */
export function parseRelativeTimeSQLite(timeStr: string): string | null {
  if (!timeStr) return null;

  // Handle "now" for latest time bound
  if (timeStr.toLowerCase() === 'now') {
    return `datetime('now')`;
  }

  // Match patterns like -24h, -15m, -7d, -1w
  const match = timeStr.match(/^-(\d+)([mhdw])$/i);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    const unitMap: Record<string, string> = {
      'm': 'minutes',
      'h': 'hours',
      'd': 'days',
      'w': 'days', // SQLite doesn't have weeks, convert to days
    };

    const sqliteUnit = unitMap[unit];
    const multiplier = unit === 'w' ? value * 7 : value;

    if (sqliteUnit) {
      return `datetime('now', '-${multiplier} ${sqliteUnit}')`;
    }
  }

  // If it looks like an absolute datetime, use it directly
  if (/^\d{4}-\d{2}-\d{2}/.test(timeStr)) {
    return `'${timeStr.replace(/'/g, "''")}'`;
  }

  return null;
}
