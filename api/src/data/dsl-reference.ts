/**
 * LogNog DSL Reference
 *
 * Complete documentation of the LogNog query language.
 * Used by:
 * - API endpoint /api/dsl/reference for external LLMs
 * - Internal AI for query generation
 * - User documentation
 */

// =============================================================================
// TYPES
// =============================================================================

export interface DSLCommand {
  name: string;
  description: string;
  syntax: string;
  parameters?: { name: string; description: string; required: boolean }[];
  examples: { query: string; description: string }[];
}

export interface DSLOperator {
  symbol: string;
  name: string;
  description: string;
  example: string;
}

export interface DSLFunction {
  name: string;
  category: 'aggregation' | 'eval-math' | 'eval-string' | 'eval-conditional' | 'eval-ip';
  description: string;
  syntax: string;
  example: string;
}

export interface DSLField {
  name: string;
  description: string;
  type: string;
  aliases?: string[];
}

// =============================================================================
// COMMANDS (18)
// =============================================================================

export const DSL_COMMANDS: DSLCommand[] = [
  {
    name: 'search',
    description: 'Filter events by field values. The primary command for querying logs.',
    syntax: 'search <field>=<value> [AND|OR <field>=<value>...]',
    parameters: [
      { name: 'field', description: 'Field name to filter on', required: true },
      { name: 'value', description: 'Value to match (supports wildcards *)', required: true },
    ],
    examples: [
      { query: 'search *', description: 'Return all recent logs' },
      { query: 'search host=webserver', description: 'Filter by hostname' },
      { query: 'search severity<=3', description: 'Show errors and above (Emergency, Alert, Critical, Error)' },
      { query: 'search index="myapp" error', description: 'Search for "error" in myapp index' },
      { query: 'search (host=web1 OR host=web2) AND severity<=4', description: 'Complex filter with grouping' },
    ],
  },
  {
    name: 'filter',
    description: 'Additional filtering after search. Same syntax as search.',
    syntax: 'filter <field><operator><value>',
    examples: [
      { query: 'search * | filter app_name="nginx"', description: 'Filter to nginx logs' },
      { query: 'search * | filter severity<=3', description: 'Filter to errors only' },
    ],
  },
  {
    name: 'where',
    description: 'Filter with expressions. Alternative to filter command.',
    syntax: 'where <expression>',
    examples: [
      { query: 'search * | where severity<=3', description: 'Filter to errors' },
      { query: 'search * | where bytes>1000', description: 'Filter by numeric field' },
    ],
  },
  {
    name: 'stats',
    description: 'Calculate aggregate statistics. Groups results and applies aggregation functions.',
    syntax: 'stats <function>(<field>) [as <alias>] [, ...] [by <field>, ...]',
    parameters: [
      { name: 'function', description: 'Aggregation function (count, sum, avg, etc.)', required: true },
      { name: 'field', description: 'Field to aggregate (optional for count)', required: false },
      { name: 'alias', description: 'Optional alias for result column', required: false },
      { name: 'by', description: 'Fields to group by', required: false },
    ],
    examples: [
      { query: 'search * | stats count', description: 'Count all events' },
      { query: 'search * | stats count by hostname', description: 'Count events per host' },
      { query: 'search * | stats count, avg(response_time) by app_name', description: 'Multiple aggregations' },
      { query: 'search * | stats dc(user) as unique_users by hostname', description: 'Distinct count with alias' },
    ],
  },
  {
    name: 'timechart',
    description: 'Time-based aggregation for charts. Creates time buckets and aggregates.',
    syntax: 'timechart span=<interval> <function>(<field>) [by <field>]',
    parameters: [
      { name: 'span', description: 'Time bucket size (1m, 5m, 1h, 1d, etc.)', required: true },
      { name: 'function', description: 'Aggregation function', required: true },
      { name: 'by', description: 'Optional split-by field', required: false },
    ],
    examples: [
      { query: 'search * | timechart span=1h count', description: 'Hourly event count' },
      { query: 'search * | timechart span=5m count by hostname', description: 'Per-host counts every 5 minutes' },
      { query: 'search * | timechart span=1d avg(response_time)', description: 'Daily average response time' },
    ],
  },
  {
    name: 'sort',
    description: 'Order results by field values. Supports both LogNog syntax (sort desc field) and Splunk-style syntax (sort -field for descending, sort +field for ascending).',
    syntax: 'sort [asc|desc] <field> [, <field>...] OR sort [-|+]<field> [, [-|+]<field>...]',
    examples: [
      { query: 'search * | sort desc timestamp', description: 'Newest first (LogNog syntax)' },
      { query: 'search * | sort -timestamp', description: 'Newest first (Splunk-style)' },
      { query: 'search * | sort asc severity', description: 'Most critical first' },
      { query: 'search * | stats count by hostname | sort desc count', description: 'Sort aggregation results' },
      { query: 'search * | stats count by hostname | sort -count', description: 'Sort aggregation results (Splunk-style)' },
    ],
  },
  {
    name: 'limit',
    description: 'Limit the number of results returned.',
    syntax: 'limit <number>',
    examples: [
      { query: 'search * | limit 100', description: 'Return only 100 results' },
      { query: 'search * | stats count by hostname | sort desc count | limit 10', description: 'Top 10 hosts' },
    ],
  },
  {
    name: 'head',
    description: 'Return first N results. Alias for limit.',
    syntax: 'head <number>',
    examples: [
      { query: 'search * | head 50', description: 'First 50 results' },
    ],
  },
  {
    name: 'tail',
    description: 'Return last N results.',
    syntax: 'tail <number>',
    examples: [
      { query: 'search * | tail 20', description: 'Last 20 results' },
    ],
  },
  {
    name: 'dedup',
    description: 'Remove duplicate events based on field values.',
    syntax: 'dedup <field> [<field>...]',
    examples: [
      { query: 'search * | dedup hostname', description: 'One event per unique hostname' },
      { query: 'search * | dedup hostname, app_name', description: 'One per host+app combination' },
    ],
  },
  {
    name: 'table',
    description: 'Display specific fields as a table. Only selected fields are returned.',
    syntax: 'table <field> [<field>...]',
    examples: [
      { query: 'search * | table timestamp, hostname, message', description: 'Show only these 3 fields' },
      { query: 'search severity<=3 | table timestamp, hostname, severity, message', description: 'Error table' },
    ],
  },
  {
    name: 'fields',
    description: 'Include or exclude specific fields from results.',
    syntax: 'fields [+|-] <field> [<field>...]',
    examples: [
      { query: 'search * | fields hostname, message', description: 'Include only these fields' },
      { query: 'search * | fields - raw, structured_data', description: 'Exclude these fields' },
    ],
  },
  {
    name: 'rename',
    description: 'Rename fields in the output.',
    syntax: 'rename <field> as <newname> [, <field> as <newname>...]',
    examples: [
      { query: 'search * | rename hostname as host', description: 'Rename single field' },
      { query: 'search * | rename hostname as host, app_name as app', description: 'Rename multiple fields' },
    ],
  },
  {
    name: 'eval',
    description: 'Calculate new field values using expressions and functions.',
    syntax: 'eval <field>=<expression> [, <field>=<expression>...]',
    examples: [
      { query: 'search * | eval kb=bytes/1024', description: 'Calculate kilobytes' },
      { query: 'search * | eval status=if(severity<=3, "error", "ok")', description: 'Conditional field' },
      { query: 'search * | eval lower_host=lower(hostname)', description: 'String function' },
    ],
  },
  {
    name: 'top',
    description: 'Find the most common values of a field.',
    syntax: 'top <number> <field>',
    examples: [
      { query: 'search * | top 10 hostname', description: 'Top 10 most active hosts' },
      { query: 'search * | top 5 app_name', description: 'Top 5 applications by event count' },
    ],
  },
  {
    name: 'rare',
    description: 'Find the least common values of a field.',
    syntax: 'rare <number> <field>',
    examples: [
      { query: 'search * | rare 10 hostname', description: 'Least active 10 hosts' },
      { query: 'search * | rare 5 app_name', description: 'Rarest 5 applications' },
    ],
  },
  {
    name: 'bin',
    description: 'Bucket time or numeric values into intervals.',
    syntax: 'bin span=<interval> <field>',
    examples: [
      { query: 'search * | bin span=1h timestamp', description: 'Group by hour' },
      { query: 'search * | bin span=100 bytes', description: 'Group bytes into 100-byte buckets' },
    ],
  },
  {
    name: 'rex',
    description: 'Extract fields from text using regular expressions with named capture groups.',
    syntax: 'rex [field=<field>] "<regex>"',
    parameters: [
      { name: 'field', description: 'Field to extract from (default: message)', required: false },
      { name: 'regex', description: 'Regex with named groups (?P<name>pattern)', required: true },
    ],
    examples: [
      { query: 'search * | rex "user=(?P<username>\\w+)"', description: 'Extract username from message' },
      { query: 'search * | rex field=raw "(?P<ip>\\d+\\.\\d+\\.\\d+\\.\\d+)"', description: 'Extract IP from raw' },
    ],
  },
];

// =============================================================================
// OPERATORS
// =============================================================================

export const DSL_COMPARISON_OPERATORS: DSLOperator[] = [
  { symbol: '=', name: 'equals', description: 'Exact match', example: 'hostname="web01"' },
  { symbol: '!=', name: 'not equals', description: 'Does not match', example: 'index!="internal"' },
  { symbol: '<', name: 'less than', description: 'Less than (numeric or string)', example: 'severity<4' },
  { symbol: '<=', name: 'less than or equal', description: 'Less than or equal', example: 'severity<=3' },
  { symbol: '>', name: 'greater than', description: 'Greater than', example: 'bytes>1000' },
  { symbol: '>=', name: 'greater than or equal', description: 'Greater than or equal', example: 'response_time>=100' },
  { symbol: '~ or :', name: 'contains/regex', description: 'Contains substring or matches regex (both ~ and : are supported for Splunk compatibility)', example: 'message~"error" or message:"error"' },
];

export const DSL_LOGICAL_OPERATORS: DSLOperator[] = [
  { symbol: 'AND', name: 'and', description: 'Both conditions must be true (implicit between conditions)', example: 'host=web1 AND severity<=3' },
  { symbol: 'OR', name: 'or', description: 'Either condition can be true', example: 'host=web1 OR host=web2' },
  { symbol: 'NOT', name: 'not', description: 'Negates the following condition', example: 'NOT severity=7' },
];

// =============================================================================
// AGGREGATION FUNCTIONS (22)
// =============================================================================

export const DSL_AGGREGATION_FUNCTIONS: DSLFunction[] = [
  // Count functions
  { name: 'count', category: 'aggregation', description: 'Count events or non-null field values', syntax: 'count() or count(<field>)', example: 'stats count by hostname' },
  { name: 'dc', category: 'aggregation', description: 'Distinct count - number of unique values', syntax: 'dc(<field>)', example: 'stats dc(user) as unique_users' },

  // Math aggregations
  { name: 'sum', category: 'aggregation', description: 'Sum of numeric values', syntax: 'sum(<field>)', example: 'stats sum(bytes) by hostname' },
  { name: 'avg', category: 'aggregation', description: 'Average of numeric values', syntax: 'avg(<field>)', example: 'stats avg(response_time)' },
  { name: 'min', category: 'aggregation', description: 'Minimum value', syntax: 'min(<field>)', example: 'stats min(timestamp)' },
  { name: 'max', category: 'aggregation', description: 'Maximum value', syntax: 'max(<field>)', example: 'stats max(bytes)' },

  // Percentiles
  { name: 'p50', category: 'aggregation', description: '50th percentile (median)', syntax: 'p50(<field>)', example: 'stats p50(response_time)' },
  { name: 'p90', category: 'aggregation', description: '90th percentile', syntax: 'p90(<field>)', example: 'stats p90(response_time)' },
  { name: 'p95', category: 'aggregation', description: '95th percentile', syntax: 'p95(<field>)', example: 'stats p95(response_time)' },
  { name: 'p99', category: 'aggregation', description: '99th percentile', syntax: 'p99(<field>)', example: 'stats p99(response_time)' },

  // Statistical
  { name: 'median', category: 'aggregation', description: 'Median value', syntax: 'median(<field>)', example: 'stats median(bytes)' },
  { name: 'mode', category: 'aggregation', description: 'Most frequent value', syntax: 'mode(<field>)', example: 'stats mode(status_code)' },
  { name: 'stddev', category: 'aggregation', description: 'Standard deviation', syntax: 'stddev(<field>)', example: 'stats stddev(response_time)' },
  { name: 'variance', category: 'aggregation', description: 'Variance', syntax: 'variance(<field>)', example: 'stats variance(response_time)' },
  { name: 'range', category: 'aggregation', description: 'Range (max - min)', syntax: 'range(<field>)', example: 'stats range(bytes)' },

  // Temporal
  { name: 'earliest', category: 'aggregation', description: 'Value from earliest event by timestamp', syntax: 'earliest(<field>)', example: 'stats earliest(status)' },
  { name: 'latest', category: 'aggregation', description: 'Value from latest event by timestamp', syntax: 'latest(<field>)', example: 'stats latest(status)' },
  { name: 'first', category: 'aggregation', description: 'First value encountered', syntax: 'first(<field>)', example: 'stats first(message)' },
  { name: 'last', category: 'aggregation', description: 'Last value encountered', syntax: 'last(<field>)', example: 'stats last(message)' },

  // Collection
  { name: 'values', category: 'aggregation', description: 'List of unique values', syntax: 'values(<field>)', example: 'stats values(hostname)' },
  { name: 'list', category: 'aggregation', description: 'List of all values', syntax: 'list(<field>)', example: 'stats list(user)' },
];

// =============================================================================
// EVAL FUNCTIONS (28+)
// =============================================================================

export const DSL_EVAL_FUNCTIONS: DSLFunction[] = [
  // Math functions
  { name: 'abs', category: 'eval-math', description: 'Absolute value', syntax: 'abs(<number>)', example: 'eval diff=abs(expected-actual)' },
  { name: 'round', category: 'eval-math', description: 'Round to decimal places', syntax: 'round(<number>, <decimals>)', example: 'eval rounded=round(avg_time, 2)' },
  { name: 'floor', category: 'eval-math', description: 'Round down to integer', syntax: 'floor(<number>)', example: 'eval floored=floor(ratio)' },
  { name: 'ceil', category: 'eval-math', description: 'Round up to integer', syntax: 'ceil(<number>)', example: 'eval ceiling=ceil(ratio)' },
  { name: 'sqrt', category: 'eval-math', description: 'Square root', syntax: 'sqrt(<number>)', example: 'eval root=sqrt(variance)' },
  { name: 'pow', category: 'eval-math', description: 'Power/exponent', syntax: 'pow(<base>, <exponent>)', example: 'eval squared=pow(value, 2)' },
  { name: 'log', category: 'eval-math', description: 'Natural logarithm', syntax: 'log(<number>)', example: 'eval ln=log(count)' },
  { name: 'log10', category: 'eval-math', description: 'Base-10 logarithm', syntax: 'log10(<number>)', example: 'eval magnitude=log10(count)' },
  { name: 'exp', category: 'eval-math', description: 'Exponential (e^x)', syntax: 'exp(<number>)', example: 'eval growth=exp(rate)' },

  // String functions
  { name: 'len', category: 'eval-string', description: 'String length', syntax: 'len(<string>)', example: 'eval msg_len=len(message)' },
  { name: 'lower', category: 'eval-string', description: 'Convert to lowercase', syntax: 'lower(<string>)', example: 'eval lower_host=lower(hostname)' },
  { name: 'upper', category: 'eval-string', description: 'Convert to uppercase', syntax: 'upper(<string>)', example: 'eval upper_name=upper(app_name)' },
  { name: 'substr', category: 'eval-string', description: 'Extract substring', syntax: 'substr(<string>, <start>, <length>)', example: 'eval prefix=substr(hostname, 0, 3)' },
  { name: 'trim', category: 'eval-string', description: 'Remove leading/trailing whitespace', syntax: 'trim(<string>)', example: 'eval clean=trim(message)' },
  { name: 'ltrim', category: 'eval-string', description: 'Remove leading whitespace', syntax: 'ltrim(<string>)', example: 'eval left_clean=ltrim(field)' },
  { name: 'rtrim', category: 'eval-string', description: 'Remove trailing whitespace', syntax: 'rtrim(<string>)', example: 'eval right_clean=rtrim(field)' },
  { name: 'replace', category: 'eval-string', description: 'Replace text', syntax: 'replace(<string>, <old>, <new>)', example: 'eval clean=replace(msg, "error", "ERROR")' },
  { name: 'split', category: 'eval-string', description: 'Split string into array', syntax: 'split(<string>, <delimiter>)', example: 'eval parts=split(path, "/")' },
  { name: 'concat', category: 'eval-string', description: 'Concatenate strings', syntax: 'concat(<string1>, <string2>, ...)', example: 'eval full=concat(first, " ", last)' },

  // Conditional functions
  { name: 'if', category: 'eval-conditional', description: 'Conditional expression', syntax: 'if(<condition>, <true_value>, <false_value>)', example: 'eval status=if(severity<=3, "error", "ok")' },
  { name: 'coalesce', category: 'eval-conditional', description: 'First non-null value', syntax: 'coalesce(<value1>, <value2>, ...)', example: 'eval name=coalesce(display_name, username, "unknown")' },
  { name: 'nullif', category: 'eval-conditional', description: 'Return null if values equal', syntax: 'nullif(<value1>, <value2>)', example: 'eval clean=nullif(value, "N/A")' },
  { name: 'case', category: 'eval-conditional', description: 'Multi-condition expression', syntax: 'case(<cond1>, <val1>, <cond2>, <val2>, ..., <default>)', example: 'eval level=case(severity<=1, "critical", severity<=3, "error", "info")' },

  // IP classification functions
  { name: 'classify_ip', category: 'eval-ip', description: 'Classify IP type', syntax: 'classify_ip(<ip>)', example: 'eval ip_type=classify_ip(source_ip)' },
  { name: 'is_public_ip', category: 'eval-ip', description: 'True if public IP', syntax: 'is_public_ip(<ip>)', example: 'eval external=is_public_ip(source_ip)' },
  { name: 'is_private_ip', category: 'eval-ip', description: 'True if private IP (RFC 1918)', syntax: 'is_private_ip(<ip>)', example: 'eval internal=is_private_ip(source_ip)' },
  { name: 'is_internal_ip', category: 'eval-ip', description: 'True if any internal IP type', syntax: 'is_internal_ip(<ip>)', example: 'eval inside=is_internal_ip(source_ip)' },
];

// =============================================================================
// FIELDS
// =============================================================================

export const DSL_CORE_FIELDS: DSLField[] = [
  { name: 'timestamp', description: 'Event timestamp', type: 'datetime', aliases: ['_time', 'time'] },
  { name: 'hostname', description: 'Source host/server name', type: 'string', aliases: ['host', 'source'] },
  { name: 'app_name', description: 'Application name', type: 'string', aliases: ['app', 'program', 'sourcetype'] },
  { name: 'severity', description: 'Log level (0=Emergency to 7=Debug)', type: 'number', aliases: ['level'] },
  { name: 'message', description: 'Log message content', type: 'string', aliases: ['msg'] },
  { name: 'index_name', description: 'Index/source where log is stored', type: 'string', aliases: ['index'] },
  { name: 'facility', description: 'Syslog facility code', type: 'number' },
  { name: 'priority', description: 'Syslog priority', type: 'number' },
  { name: 'source_ip', description: 'Source IP address', type: 'string' },
  { name: 'dest_ip', description: 'Destination IP address', type: 'string' },
  { name: 'source_port', description: 'Source port', type: 'number' },
  { name: 'dest_port', description: 'Destination port', type: 'number' },
  { name: 'protocol', description: 'Network protocol', type: 'string' },
  { name: 'user', description: 'Username', type: 'string' },
  { name: 'raw', description: 'Raw log line', type: 'string', aliases: ['_raw'] },
  { name: 'structured_data', description: 'JSON containing custom fields', type: 'json' },
];

export const DSL_SEVERITY_LEVELS = [
  { level: 0, names: ['emergency', 'emerg'], description: 'System is unusable' },
  { level: 1, names: ['alert'], description: 'Action must be taken immediately' },
  { level: 2, names: ['critical', 'crit'], description: 'Critical conditions' },
  { level: 3, names: ['error', 'err'], description: 'Error conditions' },
  { level: 4, names: ['warning', 'warn'], description: 'Warning conditions' },
  { level: 5, names: ['notice'], description: 'Normal but significant' },
  { level: 6, names: ['info', 'informational'], description: 'Informational messages' },
  { level: 7, names: ['debug'], description: 'Debug-level messages' },
];

export const DSL_TIME_SPANS = [
  { value: '1s', description: '1 second' },
  { value: '5s', description: '5 seconds' },
  { value: '30s', description: '30 seconds' },
  { value: '1m', description: '1 minute' },
  { value: '5m', description: '5 minutes' },
  { value: '15m', description: '15 minutes' },
  { value: '30m', description: '30 minutes' },
  { value: '1h', description: '1 hour' },
  { value: '4h', description: '4 hours' },
  { value: '12h', description: '12 hours' },
  { value: '1d', description: '1 day' },
  { value: '1w', description: '1 week' },
];

// =============================================================================
// COMMON PATTERNS
// =============================================================================

export const DSL_COMMON_PATTERNS = [
  { name: 'All logs', query: 'search *', description: 'Return all recent logs' },
  { name: 'Filter by index', query: 'search index="myapp"', description: 'Logs from specific index' },
  { name: 'Exclude index', query: 'search index!="internal"', description: 'Exclude an index' },
  { name: 'Multiple indexes', query: 'search (index="app1" OR index="app2")', description: 'Query multiple indexes' },
  { name: 'Errors only', query: 'search severity<=3', description: 'Emergency, Alert, Critical, Error' },
  { name: 'Error analysis', query: 'search severity<=3 | stats count by hostname', description: 'Errors per host' },
  { name: 'Top talkers', query: 'search * | top 10 hostname', description: 'Most active hosts' },
  { name: 'Time series', query: 'search * | timechart span=1h count', description: 'Hourly event counts' },
  { name: 'Per-host time series', query: 'search * | timechart span=1h count by hostname', description: 'Hourly counts by host' },
  { name: 'Keyword search', query: 'search error | table timestamp, hostname, message', description: 'Search message content' },
  { name: 'Unique values', query: 'search * | stats dc(hostname) as unique_hosts', description: 'Count unique hosts' },
  { name: 'Response times', query: 'search * | stats avg(response_time), p95(response_time), max(response_time)', description: 'Response time metrics' },
];

// =============================================================================
// MARKDOWN GENERATOR
// =============================================================================

export function generateDSLMarkdown(): string {
  let md = `# LogNog DSL Reference

A Splunk-like query language for searching and analyzing logs.

## Quick Start

\`\`\`
search *                                    # All recent logs
search severity<=3                          # Errors and above
search host=web01 | stats count by app_name # Count by app for specific host
search * | timechart span=1h count          # Hourly event count
\`\`\`

---

## Commands

`;

  for (const cmd of DSL_COMMANDS) {
    md += `### ${cmd.name}\n\n`;
    md += `${cmd.description}\n\n`;
    md += `**Syntax:** \`${cmd.syntax}\`\n\n`;
    md += `**Examples:**\n`;
    for (const ex of cmd.examples) {
      md += `- \`${ex.query}\` - ${ex.description}\n`;
    }
    md += '\n';
  }

  md += `---

## Operators

### Comparison Operators

| Operator | Name | Description | Example |
|----------|------|-------------|---------|
`;
  for (const op of DSL_COMPARISON_OPERATORS) {
    md += `| \`${op.symbol}\` | ${op.name} | ${op.description} | \`${op.example}\` |\n`;
  }

  md += `
### Logical Operators

| Operator | Description | Example |
|----------|-------------|---------|
`;
  for (const op of DSL_LOGICAL_OPERATORS) {
    md += `| \`${op.symbol}\` | ${op.description} | \`${op.example}\` |\n`;
  }

  md += `
---

## Aggregation Functions

Used with \`stats\` and \`timechart\` commands.

| Function | Description | Example |
|----------|-------------|---------|
`;
  for (const fn of DSL_AGGREGATION_FUNCTIONS) {
    md += `| \`${fn.name}()\` | ${fn.description} | \`${fn.example}\` |\n`;
  }

  md += `
---

## Eval Functions

Used with the \`eval\` command to create computed fields.

### Math Functions

| Function | Description | Example |
|----------|-------------|---------|
`;
  for (const fn of DSL_EVAL_FUNCTIONS.filter(f => f.category === 'eval-math')) {
    md += `| \`${fn.name}()\` | ${fn.description} | \`${fn.example}\` |\n`;
  }

  md += `
### String Functions

| Function | Description | Example |
|----------|-------------|---------|
`;
  for (const fn of DSL_EVAL_FUNCTIONS.filter(f => f.category === 'eval-string')) {
    md += `| \`${fn.name}()\` | ${fn.description} | \`${fn.example}\` |\n`;
  }

  md += `
### Conditional Functions

| Function | Description | Example |
|----------|-------------|---------|
`;
  for (const fn of DSL_EVAL_FUNCTIONS.filter(f => f.category === 'eval-conditional')) {
    md += `| \`${fn.name}()\` | ${fn.description} | \`${fn.example}\` |\n`;
  }

  md += `
### IP Functions

| Function | Description | Example |
|----------|-------------|---------|
`;
  for (const fn of DSL_EVAL_FUNCTIONS.filter(f => f.category === 'eval-ip')) {
    md += `| \`${fn.name}()\` | ${fn.description} | \`${fn.example}\` |\n`;
  }

  md += `
---

## Fields

### Core Fields

| Field | Type | Description | Aliases |
|-------|------|-------------|---------|
`;
  for (const field of DSL_CORE_FIELDS) {
    const aliases = field.aliases ? field.aliases.join(', ') : '-';
    md += `| \`${field.name}\` | ${field.type} | ${field.description} | ${aliases} |\n`;
  }

  md += `
### Severity Levels

| Level | Names | Description |
|-------|-------|-------------|
`;
  for (const sev of DSL_SEVERITY_LEVELS) {
    md += `| ${sev.level} | ${sev.names.join(', ')} | ${sev.description} |\n`;
  }

  md += `
### Time Spans

For use with \`timechart\` and \`bin\` commands:

`;
  for (const span of DSL_TIME_SPANS) {
    md += `- \`${span.value}\` - ${span.description}\n`;
  }

  md += `
---

## Common Patterns

`;
  for (const pattern of DSL_COMMON_PATTERNS) {
    md += `### ${pattern.name}\n\n`;
    md += `\`\`\`\n${pattern.query}\n\`\`\`\n\n`;
    md += `${pattern.description}\n\n`;
  }

  return md;
}

// =============================================================================
// JSON EXPORT
// =============================================================================

export function getDSLReferenceJSON() {
  return {
    version: '1.0',
    commands: DSL_COMMANDS,
    operators: {
      comparison: DSL_COMPARISON_OPERATORS,
      logical: DSL_LOGICAL_OPERATORS,
    },
    functions: {
      aggregation: DSL_AGGREGATION_FUNCTIONS,
      eval: DSL_EVAL_FUNCTIONS,
    },
    fields: DSL_CORE_FIELDS,
    severityLevels: DSL_SEVERITY_LEVELS,
    timeSpans: DSL_TIME_SPANS,
    commonPatterns: DSL_COMMON_PATTERNS,
  };
}
