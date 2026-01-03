// Static data for Search Autocomplete - Command dictionary, functions, operators

import { CommandDefinition, Suggestion } from './autocomplete-types';

// ============================================================================
// COMMANDS (17)
// ============================================================================

export const COMMANDS: CommandDefinition[] = [
  {
    name: 'search',
    description: 'Filter events by field values',
    syntax: 'search <field>=<value> [AND|OR ...]',
    example: 'search host=router severity>=warning',
    expectsFields: true,
  },
  {
    name: 'filter',
    description: 'Additional event filtering',
    syntax: 'filter <field><op><value>',
    example: 'filter app~"firewall"',
    expectsFields: true,
  },
  {
    name: 'where',
    description: 'Filter with expressions',
    syntax: 'where <expression>',
    example: 'where severity<=3',
    expectsExpression: true,
  },
  {
    name: 'stats',
    description: 'Calculate aggregate statistics',
    syntax: 'stats <func>(<field>) [as <alias>] [by <field>]',
    example: 'stats count, avg(bytes) by hostname',
    expectsAggregation: true,
  },
  {
    name: 'timechart',
    description: 'Time-based aggregation chart',
    syntax: 'timechart span=<interval> <func>(<field>) [by <field>]',
    example: 'timechart span=1h count by hostname',
    expectsAggregation: true,
  },
  {
    name: 'sort',
    description: 'Order results',
    syntax: 'sort [asc|desc] <field> [, <field>]',
    example: 'sort desc timestamp',
    expectsFields: true,
  },
  {
    name: 'limit',
    description: 'Limit number of results',
    syntax: 'limit <number>',
    example: 'limit 100',
    expectsNumber: true,
  },
  {
    name: 'head',
    description: 'Return first N results',
    syntax: 'head <number>',
    example: 'head 50',
    expectsNumber: true,
  },
  {
    name: 'tail',
    description: 'Return last N results',
    syntax: 'tail <number>',
    example: 'tail 20',
    expectsNumber: true,
  },
  {
    name: 'dedup',
    description: 'Remove duplicate events',
    syntax: 'dedup <field> [<field>...]',
    example: 'dedup hostname app_name',
    expectsFields: true,
  },
  {
    name: 'table',
    description: 'Display specific fields as table',
    syntax: 'table <field> [<field>...]',
    example: 'table timestamp hostname message',
    expectsFields: true,
  },
  {
    name: 'fields',
    description: 'Include or exclude fields',
    syntax: 'fields [+|-] <field> [<field>...]',
    example: 'fields - raw structured_data',
    expectsFields: true,
  },
  {
    name: 'rename',
    description: 'Rename fields',
    syntax: 'rename <field> as <newname>',
    example: 'rename hostname as host',
    expectsFields: true,
  },
  {
    name: 'eval',
    description: 'Calculate new field values',
    syntax: 'eval <field>=<expression>',
    example: 'eval rate=bytes/1024',
    expectsExpression: true,
  },
  {
    name: 'top',
    description: 'Most common field values',
    syntax: 'top <number> <field>',
    example: 'top 10 hostname',
    expectsNumber: true,
    expectsFields: true,
  },
  {
    name: 'rare',
    description: 'Least common field values',
    syntax: 'rare <number> <field>',
    example: 'rare 10 hostname',
    expectsNumber: true,
    expectsFields: true,
  },
  {
    name: 'bin',
    description: 'Bucket time or numeric values',
    syntax: 'bin span=<interval> <field>',
    example: 'bin span=1h timestamp',
    expectsFields: true,
  },
  {
    name: 'rex',
    description: 'Extract fields with regex',
    syntax: 'rex field=<field> "<regex>"',
    example: 'rex field=message "user=(?P<user>\\\\w+)"',
    expectsFields: true,
  },
];

// ============================================================================
// AGGREGATION FUNCTIONS (22)
// ============================================================================

export const AGGREGATION_FUNCTIONS: Suggestion[] = [
  { id: 'agg-count', label: 'count', insertText: 'count', category: 'aggregation', description: 'Count events', syntax: 'count', score: 100 },
  { id: 'agg-count-f', label: 'count()', insertText: 'count()', category: 'aggregation', description: 'Count non-null values', syntax: 'count(<field>)', score: 99 },
  { id: 'agg-sum', label: 'sum()', insertText: 'sum()', category: 'aggregation', description: 'Sum numeric values', syntax: 'sum(<field>)', score: 95 },
  { id: 'agg-avg', label: 'avg()', insertText: 'avg()', category: 'aggregation', description: 'Average value', syntax: 'avg(<field>)', score: 94 },
  { id: 'agg-min', label: 'min()', insertText: 'min()', category: 'aggregation', description: 'Minimum value', syntax: 'min(<field>)', score: 90 },
  { id: 'agg-max', label: 'max()', insertText: 'max()', category: 'aggregation', description: 'Maximum value', syntax: 'max(<field>)', score: 90 },
  { id: 'agg-dc', label: 'dc()', insertText: 'dc()', category: 'aggregation', description: 'Distinct count', syntax: 'dc(<field>)', score: 85 },
  { id: 'agg-values', label: 'values()', insertText: 'values()', category: 'aggregation', description: 'Unique values list', syntax: 'values(<field>)', score: 80 },
  { id: 'agg-list', label: 'list()', insertText: 'list()', category: 'aggregation', description: 'All values list', syntax: 'list(<field>)', score: 75 },
  { id: 'agg-earliest', label: 'earliest()', insertText: 'earliest()', category: 'aggregation', description: 'Earliest value by time', syntax: 'earliest(<field>)', score: 70 },
  { id: 'agg-latest', label: 'latest()', insertText: 'latest()', category: 'aggregation', description: 'Latest value by time', syntax: 'latest(<field>)', score: 70 },
  { id: 'agg-first', label: 'first()', insertText: 'first()', category: 'aggregation', description: 'First value', syntax: 'first(<field>)', score: 65 },
  { id: 'agg-last', label: 'last()', insertText: 'last()', category: 'aggregation', description: 'Last value', syntax: 'last(<field>)', score: 65 },
  { id: 'agg-median', label: 'median()', insertText: 'median()', category: 'aggregation', description: 'Median value', syntax: 'median(<field>)', score: 60 },
  { id: 'agg-mode', label: 'mode()', insertText: 'mode()', category: 'aggregation', description: 'Most frequent value', syntax: 'mode(<field>)', score: 55 },
  { id: 'agg-stddev', label: 'stddev()', insertText: 'stddev()', category: 'aggregation', description: 'Standard deviation', syntax: 'stddev(<field>)', score: 50 },
  { id: 'agg-variance', label: 'variance()', insertText: 'variance()', category: 'aggregation', description: 'Variance', syntax: 'variance(<field>)', score: 50 },
  { id: 'agg-range', label: 'range()', insertText: 'range()', category: 'aggregation', description: 'Max minus min', syntax: 'range(<field>)', score: 45 },
  { id: 'agg-p50', label: 'p50()', insertText: 'p50()', category: 'aggregation', description: '50th percentile', syntax: 'p50(<field>)', score: 40 },
  { id: 'agg-p90', label: 'p90()', insertText: 'p90()', category: 'aggregation', description: '90th percentile', syntax: 'p90(<field>)', score: 40 },
  { id: 'agg-p95', label: 'p95()', insertText: 'p95()', category: 'aggregation', description: '95th percentile', syntax: 'p95(<field>)', score: 40 },
  { id: 'agg-p99', label: 'p99()', insertText: 'p99()', category: 'aggregation', description: '99th percentile', syntax: 'p99(<field>)', score: 40 },
];

// ============================================================================
// EVAL FUNCTIONS (22)
// ============================================================================

export const EVAL_FUNCTIONS: Suggestion[] = [
  // Math functions
  { id: 'eval-abs', label: 'abs()', insertText: 'abs()', category: 'eval-function', description: 'Absolute value', syntax: 'abs(<num>)', score: 80 },
  { id: 'eval-round', label: 'round()', insertText: 'round(, 2)', category: 'eval-function', description: 'Round to decimals', syntax: 'round(<num>, <decimals>)', score: 85 },
  { id: 'eval-floor', label: 'floor()', insertText: 'floor()', category: 'eval-function', description: 'Round down', syntax: 'floor(<num>)', score: 75 },
  { id: 'eval-ceil', label: 'ceil()', insertText: 'ceil()', category: 'eval-function', description: 'Round up', syntax: 'ceil(<num>)', score: 75 },
  { id: 'eval-sqrt', label: 'sqrt()', insertText: 'sqrt()', category: 'eval-function', description: 'Square root', syntax: 'sqrt(<num>)', score: 70 },
  { id: 'eval-pow', label: 'pow()', insertText: 'pow(, )', category: 'eval-function', description: 'Power', syntax: 'pow(<base>, <exp>)', score: 70 },
  { id: 'eval-log', label: 'log()', insertText: 'log()', category: 'eval-function', description: 'Natural log', syntax: 'log(<num>)', score: 65 },
  { id: 'eval-log10', label: 'log10()', insertText: 'log10()', category: 'eval-function', description: 'Base-10 log', syntax: 'log10(<num>)', score: 65 },
  { id: 'eval-exp', label: 'exp()', insertText: 'exp()', category: 'eval-function', description: 'Exponential (e^x)', syntax: 'exp(<num>)', score: 60 },
  // String functions
  { id: 'eval-len', label: 'len()', insertText: 'len()', category: 'eval-function', description: 'String length', syntax: 'len(<str>)', score: 90 },
  { id: 'eval-lower', label: 'lower()', insertText: 'lower()', category: 'eval-function', description: 'Lowercase', syntax: 'lower(<str>)', score: 85 },
  { id: 'eval-upper', label: 'upper()', insertText: 'upper()', category: 'eval-function', description: 'Uppercase', syntax: 'upper(<str>)', score: 85 },
  { id: 'eval-substr', label: 'substr()', insertText: 'substr(, , )', category: 'eval-function', description: 'Substring', syntax: 'substr(<str>, <start>, <len>)', score: 80 },
  { id: 'eval-trim', label: 'trim()', insertText: 'trim()', category: 'eval-function', description: 'Trim whitespace', syntax: 'trim(<str>)', score: 80 },
  { id: 'eval-ltrim', label: 'ltrim()', insertText: 'ltrim()', category: 'eval-function', description: 'Trim left', syntax: 'ltrim(<str>)', score: 70 },
  { id: 'eval-rtrim', label: 'rtrim()', insertText: 'rtrim()', category: 'eval-function', description: 'Trim right', syntax: 'rtrim(<str>)', score: 70 },
  { id: 'eval-replace', label: 'replace()', insertText: 'replace(, "", "")', category: 'eval-function', description: 'Replace text', syntax: 'replace(<str>, <old>, <new>)', score: 85 },
  { id: 'eval-split', label: 'split()', insertText: 'split(, ",")', category: 'eval-function', description: 'Split string', syntax: 'split(<str>, <delim>)', score: 75 },
  { id: 'eval-concat', label: 'concat()', insertText: 'concat(, )', category: 'eval-function', description: 'Concatenate', syntax: 'concat(<str1>, <str2>)', score: 80 },
  // Conditional functions
  { id: 'eval-if', label: 'if()', insertText: 'if(, , )', category: 'eval-function', description: 'Conditional', syntax: 'if(<cond>, <true>, <false>)', score: 95 },
  { id: 'eval-coalesce', label: 'coalesce()', insertText: 'coalesce(, )', category: 'eval-function', description: 'First non-null', syntax: 'coalesce(<val1>, <val2>, ...)', score: 80 },
  { id: 'eval-nullif', label: 'nullif()', insertText: 'nullif(, )', category: 'eval-function', description: 'Null if equal', syntax: 'nullif(<val1>, <val2>)', score: 70 },
  { id: 'eval-case', label: 'case()', insertText: 'case(, , , )', category: 'eval-function', description: 'Case expression', syntax: 'case(<cond1>, <val1>, ..., <default>)', score: 75 },
];

// ============================================================================
// OPERATORS
// ============================================================================

export const OPERATORS: Suggestion[] = [
  { id: 'op-eq', label: '=', insertText: '=', category: 'operator', description: 'Equals', score: 100 },
  { id: 'op-neq', label: '!=', insertText: '!=', category: 'operator', description: 'Not equals', score: 95 },
  { id: 'op-lt', label: '<', insertText: '<', category: 'operator', description: 'Less than', score: 90 },
  { id: 'op-lte', label: '<=', insertText: '<=', category: 'operator', description: 'Less or equal', score: 85 },
  { id: 'op-gt', label: '>', insertText: '>', category: 'operator', description: 'Greater than', score: 90 },
  { id: 'op-gte', label: '>=', insertText: '>=', category: 'operator', description: 'Greater or equal', score: 85 },
  { id: 'op-contains', label: '~', insertText: '~', category: 'operator', description: 'Contains/regex', score: 80 },
];

export const LOGICAL_OPERATORS: Suggestion[] = [
  { id: 'op-and', label: 'AND', insertText: ' AND ', category: 'keyword', description: 'Logical AND', score: 90 },
  { id: 'op-or', label: 'OR', insertText: ' OR ', category: 'keyword', description: 'Logical OR', score: 85 },
  { id: 'op-not', label: 'NOT', insertText: 'NOT ', category: 'keyword', description: 'Logical NOT', score: 80 },
];

// ============================================================================
// CORE FIELDS
// ============================================================================

export const CORE_FIELDS: Suggestion[] = [
  { id: 'field-timestamp', label: 'timestamp', insertText: 'timestamp', category: 'field', description: 'Event time', score: 100 },
  { id: 'field-hostname', label: 'hostname', insertText: 'hostname', category: 'field', description: 'Source host', score: 95 },
  { id: 'field-app_name', label: 'app_name', insertText: 'app_name', category: 'field', description: 'Application name', score: 90 },
  { id: 'field-severity', label: 'severity', insertText: 'severity', category: 'field', description: 'Log level (0-7)', score: 85 },
  { id: 'field-message', label: 'message', insertText: 'message', category: 'field', description: 'Log message', score: 80 },
  { id: 'field-facility', label: 'facility', insertText: 'facility', category: 'field', description: 'Syslog facility', score: 70 },
  { id: 'field-source_ip', label: 'source_ip', insertText: 'source_ip', category: 'field', description: 'Source IP address', score: 75 },
  { id: 'field-raw', label: 'raw', insertText: 'raw', category: 'field', description: 'Raw log line', score: 60 },
  { id: 'field-index_name', label: 'index_name', insertText: 'index_name', category: 'field', description: 'Log index', score: 65 },
  { id: 'field-protocol', label: 'protocol', insertText: 'protocol', category: 'field', description: 'Network protocol', score: 55 },
];

// ============================================================================
// FIELD ALIASES (for resolving user input)
// ============================================================================

export const FIELD_ALIASES: Record<string, string> = {
  'host': 'hostname',
  'source': 'hostname',
  'app': 'app_name',
  'program': 'app_name',
  'sourcetype': 'app_name',
  'level': 'severity',
  'msg': 'message',
  '_raw': 'raw',
  '_time': 'timestamp',
  'time': 'timestamp',
  'index': 'index_name',
};

// ============================================================================
// SPAN VALUES (for bin/timechart)
// ============================================================================

export const SPAN_VALUES: Suggestion[] = [
  { id: 'span-1s', label: '1s', insertText: '1s', category: 'value', description: '1 second', score: 50 },
  { id: 'span-5s', label: '5s', insertText: '5s', category: 'value', description: '5 seconds', score: 55 },
  { id: 'span-30s', label: '30s', insertText: '30s', category: 'value', description: '30 seconds', score: 60 },
  { id: 'span-1m', label: '1m', insertText: '1m', category: 'value', description: '1 minute', score: 80 },
  { id: 'span-5m', label: '5m', insertText: '5m', category: 'value', description: '5 minutes', score: 90 },
  { id: 'span-15m', label: '15m', insertText: '15m', category: 'value', description: '15 minutes', score: 85 },
  { id: 'span-30m', label: '30m', insertText: '30m', category: 'value', description: '30 minutes', score: 80 },
  { id: 'span-1h', label: '1h', insertText: '1h', category: 'value', description: '1 hour', score: 95 },
  { id: 'span-4h', label: '4h', insertText: '4h', category: 'value', description: '4 hours', score: 75 },
  { id: 'span-12h', label: '12h', insertText: '12h', category: 'value', description: '12 hours', score: 70 },
  { id: 'span-1d', label: '1d', insertText: '1d', category: 'value', description: '1 day', score: 85 },
  { id: 'span-1w', label: '1w', insertText: '1w', category: 'value', description: '1 week', score: 60 },
];

// ============================================================================
// SORT KEYWORDS
// ============================================================================

export const SORT_KEYWORDS: Suggestion[] = [
  { id: 'sort-asc', label: 'asc', insertText: 'asc ', category: 'keyword', description: 'Ascending order', score: 90 },
  { id: 'sort-desc', label: 'desc', insertText: 'desc ', category: 'keyword', description: 'Descending order', score: 95 },
];

// ============================================================================
// BY KEYWORD
// ============================================================================

export const BY_KEYWORD: Suggestion = {
  id: 'kw-by',
  label: 'by',
  insertText: 'by ',
  category: 'keyword',
  description: 'Group by field',
  score: 90,
};

export const AS_KEYWORD: Suggestion = {
  id: 'kw-as',
  label: 'as',
  insertText: 'as ',
  category: 'keyword',
  description: 'Alias field',
  score: 85,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const COMMAND_NAMES = COMMANDS.map(c => c.name);

export function commandsToSuggestions(): Suggestion[] {
  return COMMANDS.map(cmd => ({
    id: `cmd-${cmd.name}`,
    label: cmd.name,
    insertText: cmd.name + ' ',
    category: 'command' as const,
    description: cmd.description,
    syntax: cmd.syntax,
    example: cmd.example,
    score: 80,
  }));
}

export function getCommandByName(name: string): CommandDefinition | undefined {
  return COMMANDS.find(c => c.name === name.toLowerCase());
}

export function isCommand(name: string): boolean {
  return COMMAND_NAMES.includes(name.toLowerCase());
}

export function resolveFieldAlias(field: string): string {
  return FIELD_ALIASES[field.toLowerCase()] || field;
}
