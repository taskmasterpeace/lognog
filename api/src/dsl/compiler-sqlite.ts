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
            groupByFields.push(this.mapField(stage.groupBy));
          }
          orderByFields = [`${timeBucket} ASC`];
          break;

        case 'rex':
          // Rex extracts fields using regex - add to select
          const rexExtractions = this.compileRex(stage);
          selectFields.push(...rexExtractions);
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
        case 'median':
          // SQLite doesn't have native median, use percentile approximation
          return `(SELECT AVG(${field}) FROM (SELECT ${field} FROM logs ORDER BY ${field} LIMIT 2 - (SELECT COUNT(*) FROM logs) % 2 OFFSET (SELECT (COUNT(*) - 1) / 2 FROM logs))) AS ${alias}`;
        case 'mode':
          // Most common value - select value with highest count
          return `(SELECT ${field} FROM logs GROUP BY ${field} ORDER BY COUNT(*) DESC LIMIT 1) AS ${alias}`;
        case 'stddev':
          // SQLite doesn't have stddev, needs custom calculation or extension
          return `0 AS ${alias}`;
        case 'variance':
          // SQLite doesn't have variance, needs custom calculation or extension
          return `0 AS ${alias}`;
        case 'range':
          return `MAX(${field}) - MIN(${field}) AS ${alias}`;
        case 'p50':
          // 50th percentile (median)
          return `(SELECT AVG(${field}) FROM (SELECT ${field} FROM logs ORDER BY ${field} LIMIT 2 - (SELECT COUNT(*) FROM logs) % 2 OFFSET (SELECT (COUNT(*) - 1) / 2 FROM logs))) AS ${alias}`;
        case 'p90':
          // 90th percentile approximation
          return `(SELECT ${field} FROM logs ORDER BY ${field} LIMIT 1 OFFSET (SELECT CAST(COUNT(*) * 0.9 AS INTEGER) FROM logs)) AS ${alias}`;
        case 'p95':
          // 95th percentile approximation
          return `(SELECT ${field} FROM logs ORDER BY ${field} LIMIT 1 OFFSET (SELECT CAST(COUNT(*) * 0.95 AS INTEGER) FROM logs)) AS ${alias}`;
        case 'p99':
          // 99th percentile approximation
          return `(SELECT ${field} FROM logs ORDER BY ${field} LIMIT 1 OFFSET (SELECT CAST(COUNT(*) * 0.99 AS INTEGER) FROM logs)) AS ${alias}`;
        case 'first':
          // First value - use MIN(rowid)
          return `(SELECT ${field} FROM logs WHERE rowid = (SELECT MIN(rowid) FROM logs)) AS ${alias}`;
        case 'last':
          // Last value - use MAX(rowid)
          return `(SELECT ${field} FROM logs WHERE rowid = (SELECT MAX(rowid) FROM logs)) AS ${alias}`;
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
    const field = this.mapField(bin.field);
    const span = bin.span;

    // Check if this is a time field
    if (field === 'timestamp' || field.includes('time')) {
      return this.compileTimeBucket(span.toString());
    }

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
      case 'case':
        // case(field, val1, result1, val2, result2, ..., default)
        if (compiledArgs.length < 3) {
          return compiledArgs[0] || 'NULL';
        }
        const field = compiledArgs[0];
        let caseExpr = 'CASE';
        for (let i = 1; i < compiledArgs.length - 1; i += 2) {
          if (i + 1 < compiledArgs.length - 1) {
            caseExpr += ` WHEN ${field} = ${compiledArgs[i]} THEN ${compiledArgs[i + 1]}`;
          }
        }
        caseExpr += ` ELSE ${compiledArgs[compiledArgs.length - 1]} END`;
        return caseExpr;

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
