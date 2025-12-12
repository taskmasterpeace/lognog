/**
 * SQLite-compatible DSL compiler for LogNog Lite.
 *
 * This compiler generates SQLite-compatible SQL instead of ClickHouse SQL.
 * Key differences:
 * - Uses 'logs' table instead of 'spunk.logs'
 * - Replaces ClickHouse functions with SQLite equivalents
 * - Different time functions
 */

import {
  QueryAST,
  StatsNode,
  SortNode,
  Condition,
  CompiledQuery,
} from './types.js';

// Default fields to select
const DEFAULT_FIELDS = [
  'timestamp',
  'hostname',
  'app_name',
  'severity',
  'message',
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

export class SQLiteCompiler {
  private ast: QueryAST;
  private params: unknown[] = [];

  constructor(ast: QueryAST) {
    this.ast = ast;
  }

  compile(): CompiledQuery {
    const stages = this.ast.stages;

    if (stages.length === 0) {
      // Default query - recent logs
      return {
        sql: `SELECT ${DEFAULT_FIELDS.join(', ')} FROM logs ORDER BY timestamp DESC LIMIT 1000`,
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
          groupByFields = stage.groupBy.map(f => this.mapField(f));
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

        case 'rename':
          // Handle rename with AS
          selectFields = selectFields.map(f => {
            const mapping = stage.mappings.find(m => m.from === f);
            return mapping ? `${f} AS ${mapping.to}` : f;
          });
          break;

        case 'eval':
          // Eval creates new computed fields
          for (const assignment of stage.assignments) {
            selectFields.push(`${assignment.expression} AS ${assignment.field}`);
          }
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

    // Use 'logs' table for SQLite (not 'spunk.logs')
    sql += ' FROM logs';

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

    return { sql, params: this.params };
  }

  private compileConditions(conditions: Condition[]): string[] {
    return conditions.map(cond => {
      const field = this.mapField(cond.field);
      let expr: string;

      switch (cond.operator) {
        case '=':
          if (cond.value === '*') {
            expr = `${field} != ''`;
          } else if (typeof cond.value === 'string') {
            expr = `${field} = '${this.escape(cond.value)}'`;
          } else {
            expr = `${field} = ${cond.value}`;
          }
          break;

        case '!=':
          if (typeof cond.value === 'string') {
            expr = `${field} != '${this.escape(cond.value)}'`;
          } else {
            expr = `${field} != ${cond.value}`;
          }
          break;

        case '<':
        case '<=':
        case '>':
        case '>=':
          if (field === 'severity') {
            // Severity is numeric
            expr = `${field} ${cond.operator} ${this.severityToNumber(cond.value)}`;
          } else if (typeof cond.value === 'string') {
            expr = `${field} ${cond.operator} '${this.escape(cond.value)}'`;
          } else {
            expr = `${field} ${cond.operator} ${cond.value}`;
          }
          break;

        case '~':
          // Contains or regex match - use LIKE for SQLite
          if (typeof cond.value === 'string') {
            if (cond.value.includes('*')) {
              // Wildcard pattern -> LIKE
              const pattern = cond.value.replace(/\*/g, '%');
              expr = `${field} LIKE '${this.escape(pattern)}'`;
            } else {
              // Simple contains -> LIKE with wildcards (case-insensitive with COLLATE)
              expr = `${field} LIKE '%${this.escape(cond.value)}%' COLLATE NOCASE`;
            }
          } else {
            expr = `${field} LIKE '%${cond.value}%'`;
          }
          break;

        case 'IN':
          expr = `${field} IN (${cond.value})`;
          break;

        case 'NOT IN':
          expr = `${field} NOT IN (${cond.value})`;
          break;

        default:
          expr = '1=1';
      }

      if (cond.negate) {
        expr = `NOT (${expr})`;
      }

      return expr;
    });
  }

  private compileStats(stats: StatsNode): string[] {
    return stats.aggregations.map(agg => {
      const field = agg.field ? this.mapField(agg.field) : null;
      const alias = agg.alias || `${agg.function}_${field || 'all'}`;

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
          // ClickHouse argMin() -> SQLite subquery
          // Get value of field at earliest timestamp
          return `(SELECT ${field} FROM logs AS sub WHERE sub.rowid = MIN(logs.rowid)) AS ${alias}`;
        case 'latest':
          // ClickHouse argMax() -> SQLite subquery
          // Get value of field at latest timestamp
          return `(SELECT ${field} FROM logs AS sub WHERE sub.rowid = MAX(logs.rowid)) AS ${alias}`;
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
}

// Helper function to compile DSL to SQLite SQL
export function compileDSLToSQLite(ast: QueryAST): CompiledQuery {
  const compiler = new SQLiteCompiler(ast);
  return compiler.compile();
}

/**
 * Parse relative time strings and return SQLite datetime expression.
 * Examples: "-24h" -> datetime('now', '-24 hours')
 */
export function parseRelativeTimeSQLite(timeStr: string): string | null {
  if (!timeStr) return null;

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
