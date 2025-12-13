import {
  QueryAST,
  ASTNode,
  SearchNode,
  FilterNode,
  WhereNode,
  StatsNode,
  SortNode,
  LimitNode,
  DedupNode,
  TableNode,
  FieldsNode,
  RenameNode,
  TopNode,
  RareNode,
  BinNode,
  TimechartNode,
  RexNode,
  Condition,
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

// Map DSL field names to ClickHouse column names
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

export class Compiler {
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
        sql: `SELECT ${DEFAULT_FIELDS.join(', ')} FROM spunk.logs ORDER BY timestamp DESC LIMIT 1000`,
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
          // Dedup is handled with DISTINCT ON
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
          aggregationSelect = [`count() AS count`];
          groupByFields = [topField];
          orderByFields = ['count DESC'];
          limitCount = stage.limit;
          break;

        case 'rare':
          // Rare values - transform to stats + sort asc + limit
          isAggregation = true;
          const rareField = this.mapField(stage.field);
          aggregationSelect = [`count() AS count`];
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

    sql += ' FROM spunk.logs';

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
        // Contains or regex match
        if (typeof cond.value === 'string') {
          if (cond.value.includes('*')) {
            // Wildcard pattern -> LIKE
            const pattern = cond.value.replace(/\*/g, '%');
            expr = `${field} LIKE '${this.escape(pattern)}'`;
          } else {
            // Simple contains -> positionCaseInsensitive
            expr = `positionCaseInsensitive(${field}, '${this.escape(cond.value)}') > 0`;
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
          return field ? `count(${field}) AS ${alias}` : `count() AS ${alias}`;
        case 'sum':
          return `sum(${field}) AS ${alias}`;
        case 'avg':
          return `avg(${field}) AS ${alias}`;
        case 'min':
          return `min(${field}) AS ${alias}`;
        case 'max':
          return `max(${field}) AS ${alias}`;
        case 'dc':
          return `uniq(${field}) AS ${alias}`;
        case 'values':
          return `groupArray(${field}) AS ${alias}`;
        case 'earliest':
          return `argMin(${field}, timestamp) AS ${alias}`;
        case 'latest':
          return `argMax(${field}, timestamp) AS ${alias}`;
        case 'median':
          return `median(${field}) AS ${alias}`;
        case 'mode':
          return `topK(1)(${field})[1] AS ${alias}`;
        case 'stddev':
          return `stddevPop(${field}) AS ${alias}`;
        case 'variance':
          return `varPop(${field}) AS ${alias}`;
        case 'range':
          return `max(${field}) - min(${field}) AS ${alias}`;
        case 'p50':
          return `quantile(0.5)(${field}) AS ${alias}`;
        case 'p90':
          return `quantile(0.9)(${field}) AS ${alias}`;
        case 'p95':
          return `quantile(0.95)(${field}) AS ${alias}`;
        case 'p99':
          return `quantile(0.99)(${field}) AS ${alias}`;
        case 'first':
          return `any(${field}) AS ${alias}`;
        case 'last':
          return `anyLast(${field}) AS ${alias}`;
        case 'list':
          return `groupArray(${field}) AS ${alias}`;
        default:
          return `count() AS ${alias}`;
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
    return value.replace(/'/g, "''").replace(/\\/g, '\\\\');
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

    // Numeric binning
    if (typeof span === 'number') {
      return `(floor(${field} / ${span}) * ${span}) AS ${bin.field}_bucket`;
    }

    // Try to parse as numeric from string
    const numSpan = parseFloat(span.toString());
    if (!isNaN(numSpan)) {
      return `(floor(${field} / ${numSpan}) * ${numSpan}) AS ${bin.field}_bucket`;
    }

    // Fallback to time bucketing
    return this.compileTimeBucket(span.toString());
  }

  private compileTimeBucket(span: string): string {
    // Parse span like "1h", "5m", "1d"
    const match = span.match(/^(\d+)([smhd])$/i);
    if (!match) {
      // Default to 1 hour if invalid
      return `toStartOfHour(timestamp) AS time_bucket`;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 's':
        if (value === 1) return `toStartOfSecond(timestamp) AS time_bucket`;
        return `toStartOfInterval(timestamp, INTERVAL ${value} SECOND) AS time_bucket`;
      case 'm':
        if (value === 1) return `toStartOfMinute(timestamp) AS time_bucket`;
        if (value === 5) return `toStartOfFiveMinutes(timestamp) AS time_bucket`;
        if (value === 10) return `toStartOfTenMinutes(timestamp) AS time_bucket`;
        if (value === 15) return `toStartOfFifteenMinutes(timestamp) AS time_bucket`;
        return `toStartOfInterval(timestamp, INTERVAL ${value} MINUTE) AS time_bucket`;
      case 'h':
        if (value === 1) return `toStartOfHour(timestamp) AS time_bucket`;
        return `toStartOfInterval(timestamp, INTERVAL ${value} HOUR) AS time_bucket`;
      case 'd':
        if (value === 1) return `toStartOfDay(timestamp) AS time_bucket`;
        return `toStartOfInterval(timestamp, INTERVAL ${value} DAY) AS time_bucket`;
      default:
        return `toStartOfHour(timestamp) AS time_bucket`;
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

    // Generate ClickHouse extractAll or extract statements
    const extractions: string[] = [];
    for (const group of namedGroups) {
      // Use extractGroups or match function in ClickHouse
      extractions.push(`extract(${field}, '${this.escape(pattern)}') AS ${group}`);
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
        return this.compileFunction(expr.name, expr.args);

      default:
        return '0';
    }
  }

  private compileFunction(name: string, args: EvalExpression[]): string {
    const compiledArgs = args.map(arg => this.compileEvalExpression(arg));

    // Comparison pseudo-functions (used for if conditions)
    if (name.startsWith('_cmp_')) {
      const op = name.substring(5); // Remove '_cmp_' prefix
      return `${compiledArgs[0]} ${op} ${compiledArgs[1]}`;
    }

    // Math functions
    switch (name) {
      case 'abs':
        return `abs(${compiledArgs[0]})`;
      case 'round':
        return compiledArgs.length > 1
          ? `round(${compiledArgs[0]}, ${compiledArgs[1]})`
          : `round(${compiledArgs[0]})`;
      case 'floor':
        return `floor(${compiledArgs[0]})`;
      case 'ceil':
        return `ceil(${compiledArgs[0]})`;
      case 'sqrt':
        return `sqrt(${compiledArgs[0]})`;
      case 'pow':
        return `pow(${compiledArgs[0]}, ${compiledArgs[1]})`;
      case 'log':
        return `log(${compiledArgs[0]})`;
      case 'log10':
        return `log10(${compiledArgs[0]})`;
      case 'exp':
        return `exp(${compiledArgs[0]})`;

      // String functions
      case 'len':
      case 'length':
        return `length(${compiledArgs[0]})`;
      case 'lower':
        return `lower(${compiledArgs[0]})`;
      case 'upper':
        return `upper(${compiledArgs[0]})`;
      case 'substr':
      case 'substring':
        return compiledArgs.length === 3
          ? `substring(${compiledArgs[0]}, ${compiledArgs[1]}, ${compiledArgs[2]})`
          : `substring(${compiledArgs[0]}, ${compiledArgs[1]})`;
      case 'trim':
        return `trim(${compiledArgs[0]})`;
      case 'ltrim':
        return `trimLeft(${compiledArgs[0]})`;
      case 'rtrim':
        return `trimRight(${compiledArgs[0]})`;
      case 'replace':
        return `replaceAll(${compiledArgs[0]}, ${compiledArgs[1]}, ${compiledArgs[2]})`;
      case 'split':
        // split(s, delimiter, index) -> splitByChar(delimiter, s)[index]
        return compiledArgs.length === 3
          ? `arrayElement(splitByChar(${compiledArgs[1]}, ${compiledArgs[0]}), ${compiledArgs[2]} + 1)`
          : `splitByChar(${compiledArgs[1]}, ${compiledArgs[0]})`;
      case 'concat':
        return `concat(${compiledArgs.join(', ')})`;

      // Conditional functions
      case 'if':
        // if(condition, then, else) - ClickHouse uses same syntax
        return `if(${compiledArgs[0]}, ${compiledArgs[1]}, ${compiledArgs[2]})`;
      case 'coalesce':
        return `coalesce(${compiledArgs.join(', ')})`;
      case 'nullif':
        return `nullIf(${compiledArgs[0]}, ${compiledArgs[1]})`;
      case 'case':
        // case(field, val1, result1, val2, result2, ..., default)
        // Convert to ClickHouse multiIf or CASE WHEN
        if (compiledArgs.length < 3) {
          return compiledArgs[0] || 'NULL';
        }
        const field = compiledArgs[0];
        let caseExpr = 'multiIf(';
        for (let i = 1; i < compiledArgs.length - 1; i += 2) {
          if (i + 1 < compiledArgs.length - 1) {
            caseExpr += `${field} = ${compiledArgs[i]}, ${compiledArgs[i + 1]}, `;
          }
        }
        caseExpr += compiledArgs[compiledArgs.length - 1] + ')';
        return caseExpr;

      // IP Classification functions
      case 'classify_ip':
        // Returns the IP type: 'private', 'public', 'loopback', 'reserved', 'multicast', 'link_local'
        // Use multiIf to classify based on IP ranges
        return this.compileIPClassification(compiledArgs[0]);

      case 'is_public_ip':
        // Returns true if the IP is public
        return `NOT (${this.compileIsInternalIP(compiledArgs[0])})`;

      case 'is_private_ip':
        // Returns true if the IP is RFC 1918 private
        return this.compileIsPrivateIP(compiledArgs[0]);

      case 'is_internal_ip':
        // Returns true if the IP is internal (private, loopback, link-local, etc.)
        return this.compileIsInternalIP(compiledArgs[0]);

      case 'is_loopback_ip':
        // Returns true if the IP is loopback (127.x.x.x)
        return `toIPv4(${compiledArgs[0]}) BETWEEN toIPv4('127.0.0.0') AND toIPv4('127.255.255.255')`;

      case 'is_link_local_ip':
        // Returns true if the IP is link-local/APIPA (169.254.x.x)
        return `toIPv4(${compiledArgs[0]}) BETWEEN toIPv4('169.254.0.0') AND toIPv4('169.254.255.255')`;

      case 'is_multicast_ip':
        // Returns true if the IP is multicast (224-239.x.x.x)
        return `toIPv4(${compiledArgs[0]}) BETWEEN toIPv4('224.0.0.0') AND toIPv4('239.255.255.255')`;

      case 'is_reserved_ip':
        // Returns true if the IP is reserved
        return `(toIPv4(${compiledArgs[0]}) BETWEEN toIPv4('0.0.0.0') AND toIPv4('0.255.255.255')) OR (toIPv4(${compiledArgs[0]}) BETWEEN toIPv4('240.0.0.0') AND toIPv4('255.255.255.255'))`;

      default:
        // Unknown function - pass through as-is
        return `${name}(${compiledArgs.join(', ')})`;
    }
  }

  /**
   * Compile IP classification logic using ClickHouse multiIf
   */
  private compileIPClassification(ipExpr: string): string {
    // Use multiIf to classify IP addresses based on ranges
    return `multiIf(
      toIPv4(${ipExpr}) BETWEEN toIPv4('127.0.0.0') AND toIPv4('127.255.255.255'), 'loopback',
      toIPv4(${ipExpr}) BETWEEN toIPv4('169.254.0.0') AND toIPv4('169.254.255.255'), 'link_local',
      toIPv4(${ipExpr}) BETWEEN toIPv4('224.0.0.0') AND toIPv4('239.255.255.255'), 'multicast',
      toIPv4(${ipExpr}) BETWEEN toIPv4('240.0.0.0') AND toIPv4('255.255.255.255'), 'reserved',
      toIPv4(${ipExpr}) BETWEEN toIPv4('0.0.0.0') AND toIPv4('0.255.255.255'), 'reserved',
      toIPv4(${ipExpr}) BETWEEN toIPv4('192.0.0.0') AND toIPv4('192.0.0.255'), 'reserved',
      toIPv4(${ipExpr}) BETWEEN toIPv4('192.0.2.0') AND toIPv4('192.0.2.255'), 'reserved',
      toIPv4(${ipExpr}) BETWEEN toIPv4('198.51.100.0') AND toIPv4('198.51.100.255'), 'reserved',
      toIPv4(${ipExpr}) BETWEEN toIPv4('203.0.113.0') AND toIPv4('203.0.113.255'), 'reserved',
      toIPv4(${ipExpr}) BETWEEN toIPv4('198.18.0.0') AND toIPv4('198.19.255.255'), 'reserved',
      toIPv4(${ipExpr}) BETWEEN toIPv4('10.0.0.0') AND toIPv4('10.255.255.255'), 'private',
      toIPv4(${ipExpr}) BETWEEN toIPv4('172.16.0.0') AND toIPv4('172.31.255.255'), 'private',
      toIPv4(${ipExpr}) BETWEEN toIPv4('192.168.0.0') AND toIPv4('192.168.255.255'), 'private',
      toIPv4(${ipExpr}) BETWEEN toIPv4('100.64.0.0') AND toIPv4('100.127.255.255'), 'private',
      'public'
    )`;
  }

  /**
   * Compile is_private_ip check (RFC 1918 + CGN)
   */
  private compileIsPrivateIP(ipExpr: string): string {
    return `(
      toIPv4(${ipExpr}) BETWEEN toIPv4('10.0.0.0') AND toIPv4('10.255.255.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('172.16.0.0') AND toIPv4('172.31.255.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('192.168.0.0') AND toIPv4('192.168.255.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('100.64.0.0') AND toIPv4('100.127.255.255')
    )`;
  }

  /**
   * Compile is_internal_ip check (all non-public IPs)
   */
  private compileIsInternalIP(ipExpr: string): string {
    return `(
      toIPv4(${ipExpr}) BETWEEN toIPv4('10.0.0.0') AND toIPv4('10.255.255.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('172.16.0.0') AND toIPv4('172.31.255.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('192.168.0.0') AND toIPv4('192.168.255.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('100.64.0.0') AND toIPv4('100.127.255.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('127.0.0.0') AND toIPv4('127.255.255.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('169.254.0.0') AND toIPv4('169.254.255.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('224.0.0.0') AND toIPv4('239.255.255.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('240.0.0.0') AND toIPv4('255.255.255.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('0.0.0.0') AND toIPv4('0.255.255.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('192.0.0.0') AND toIPv4('192.0.0.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('192.0.2.0') AND toIPv4('192.0.2.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('198.51.100.0') AND toIPv4('198.51.100.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('203.0.113.0') AND toIPv4('203.0.113.255') OR
      toIPv4(${ipExpr}) BETWEEN toIPv4('198.18.0.0') AND toIPv4('198.19.255.255')
    )`;
  }
}

// Helper function to compile DSL to SQL
export function compileDSL(ast: QueryAST): CompiledQuery {
  const compiler = new Compiler(ast);
  return compiler.compile();
}
