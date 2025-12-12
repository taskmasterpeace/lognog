// Token types for the DSL lexer
export enum TokenType {
  // Keywords
  SEARCH = 'SEARCH',
  FILTER = 'FILTER',
  STATS = 'STATS',
  SORT = 'SORT',
  LIMIT = 'LIMIT',
  HEAD = 'HEAD',
  TAIL = 'TAIL',
  DEDUP = 'DEDUP',
  TABLE = 'TABLE',
  FIELDS = 'FIELDS',
  RENAME = 'RENAME',
  EVAL = 'EVAL',
  WHERE = 'WHERE',
  BY = 'BY',
  AS = 'AS',
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
  ASC = 'ASC',
  DESC = 'DESC',

  // Aggregation functions
  COUNT = 'COUNT',
  SUM = 'SUM',
  AVG = 'AVG',
  MIN = 'MIN',
  MAX = 'MAX',
  DC = 'DC', // distinct count
  VALUES = 'VALUES',
  EARLIEST = 'EARLIEST',
  LATEST = 'LATEST',

  // Literals
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  IDENTIFIER = 'IDENTIFIER',
  WILDCARD = 'WILDCARD',
  REGEX = 'REGEX',

  // Operators
  EQUALS = 'EQUALS',
  NOT_EQUALS = 'NOT_EQUALS',
  LESS_THAN = 'LESS_THAN',
  LESS_THAN_EQ = 'LESS_THAN_EQ',
  GREATER_THAN = 'GREATER_THAN',
  GREATER_THAN_EQ = 'GREATER_THAN_EQ',
  CONTAINS = 'CONTAINS', // ~

  // Punctuation
  PIPE = 'PIPE',
  COMMA = 'COMMA',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',

  // Special
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

// AST Node types
export type ASTNode =
  | SearchNode
  | FilterNode
  | StatsNode
  | SortNode
  | LimitNode
  | DedupNode
  | TableNode
  | FieldsNode
  | RenameNode
  | EvalNode
  | WhereNode;

export interface SearchNode {
  type: 'search';
  conditions: Condition[];
}

export interface FilterNode {
  type: 'filter';
  conditions: Condition[];
}

export interface WhereNode {
  type: 'where';
  conditions: Condition[];
}

export interface Condition {
  field: string;
  operator: ComparisonOperator;
  value: string | number | null;
  negate?: boolean;
}

export type ComparisonOperator =
  | '='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | '~'   // contains/regex
  | 'IN'
  | 'NOT IN';

export interface StatsNode {
  type: 'stats';
  aggregations: Aggregation[];
  groupBy: string[];
}

export interface Aggregation {
  function: AggregationFunction;
  field: string | null; // null for count()
  alias?: string;
}

export type AggregationFunction =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'dc'
  | 'values'
  | 'earliest'
  | 'latest';

export interface SortNode {
  type: 'sort';
  fields: SortField[];
}

export interface SortField {
  field: string;
  direction: 'asc' | 'desc';
}

export interface LimitNode {
  type: 'limit';
  count: number;
}

export interface DedupNode {
  type: 'dedup';
  fields: string[];
}

export interface TableNode {
  type: 'table';
  fields: string[];
}

export interface FieldsNode {
  type: 'fields';
  include: boolean; // true = include only, false = exclude
  fields: string[];
}

export interface RenameNode {
  type: 'rename';
  mappings: { from: string; to: string }[];
}

export interface EvalNode {
  type: 'eval';
  assignments: { field: string; expression: string }[];
}

// Query AST
export interface QueryAST {
  stages: ASTNode[];
  timeRange?: {
    earliest: string;
    latest: string;
  };
  index?: string;
}

// Compiled SQL result
export interface CompiledQuery {
  sql: string;
  params: unknown[];
}

// Parse error
export class ParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number
  ) {
    super(`Parse error at line ${line}, column ${column}: ${message}`);
    this.name = 'ParseError';
  }
}
