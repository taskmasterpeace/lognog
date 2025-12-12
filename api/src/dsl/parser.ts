import {
  Token,
  TokenType,
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
  EvalNode,
  Condition,
  Aggregation,
  SortField,
  ComparisonOperator,
  AggregationFunction,
  ParseError,
} from './types.js';

export class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): QueryAST {
    const stages: ASTNode[] = [];

    // Parse first command (usually search)
    if (!this.isAtEnd()) {
      const first = this.parseCommand();
      if (first) stages.push(first);
    }

    // Parse pipe-separated commands
    while (this.match(TokenType.PIPE)) {
      const command = this.parseCommand();
      if (command) stages.push(command);
    }

    if (!this.isAtEnd()) {
      throw new ParseError(
        `Unexpected token '${this.peek().value}'`,
        this.peek().line,
        this.peek().column
      );
    }

    return { stages };
  }

  private parseCommand(): ASTNode | null {
    const token = this.peek();

    switch (token.type) {
      case TokenType.SEARCH:
        return this.parseSearch();
      case TokenType.FILTER:
        return this.parseFilter();
      case TokenType.WHERE:
        return this.parseWhere();
      case TokenType.STATS:
        return this.parseStats();
      case TokenType.SORT:
        return this.parseSort();
      case TokenType.LIMIT:
      case TokenType.HEAD:
        return this.parseLimit();
      case TokenType.TAIL:
        return this.parseTail();
      case TokenType.DEDUP:
        return this.parseDedup();
      case TokenType.TABLE:
        return this.parseTable();
      case TokenType.FIELDS:
        return this.parseFields();
      case TokenType.RENAME:
        return this.parseRename();
      case TokenType.EVAL:
        return this.parseEval();
      case TokenType.IDENTIFIER:
        // Implicit search with field=value
        return this.parseImplicitSearch();
      default:
        if (token.type === TokenType.EOF) return null;
        throw new ParseError(
          `Unknown command '${token.value}'`,
          token.line,
          token.column
        );
    }
  }

  private parseSearch(): SearchNode {
    this.consume(TokenType.SEARCH, 'Expected "search"');
    const conditions = this.parseConditions();
    return { type: 'search', conditions };
  }

  private parseImplicitSearch(): SearchNode {
    const conditions = this.parseConditions();
    return { type: 'search', conditions };
  }

  private parseFilter(): FilterNode {
    this.consume(TokenType.FILTER, 'Expected "filter"');
    const conditions = this.parseConditions();
    return { type: 'filter', conditions };
  }

  private parseWhere(): WhereNode {
    this.consume(TokenType.WHERE, 'Expected "where"');
    const conditions = this.parseConditions();
    return { type: 'where', conditions };
  }

  private parseConditions(): Condition[] {
    const conditions: Condition[] = [];

    while (!this.isAtEnd() && !this.check(TokenType.PIPE)) {
      // Skip AND/OR for now - treat as implicit AND
      if (this.match(TokenType.AND, TokenType.OR)) {
        continue;
      }

      // Handle wildcard * as "match all"
      if (this.match(TokenType.WILDCARD)) {
        // Wildcard means match all - don't add any condition
        continue;
      }

      const negate = this.match(TokenType.NOT);

      if (this.check(TokenType.IDENTIFIER) || this.check(TokenType.STRING)) {
        const condition = this.parseCondition(negate);
        if (condition) conditions.push(condition);
      } else {
        break;
      }
    }

    return conditions;
  }

  private parseCondition(negate: boolean): Condition | null {
    const field = this.consume(
      TokenType.IDENTIFIER,
      'Expected field name'
    ).value;

    // Check for operator
    let operator: ComparisonOperator = '=';

    if (this.match(TokenType.EQUALS)) {
      operator = '=';
    } else if (this.match(TokenType.NOT_EQUALS)) {
      operator = '!=';
    } else if (this.match(TokenType.LESS_THAN)) {
      operator = '<';
    } else if (this.match(TokenType.LESS_THAN_EQ)) {
      operator = '<=';
    } else if (this.match(TokenType.GREATER_THAN)) {
      operator = '>';
    } else if (this.match(TokenType.GREATER_THAN_EQ)) {
      operator = '>=';
    } else if (this.match(TokenType.CONTAINS)) {
      operator = '~';
    } else {
      // No operator - this might be a keyword search
      return { field: '_raw', operator: '~', value: field, negate };
    }

    // Parse value
    let value: string | number | null = null;

    if (this.match(TokenType.STRING)) {
      value = this.previous().value;
    } else if (this.match(TokenType.NUMBER)) {
      value = parseFloat(this.previous().value);
    } else if (this.match(TokenType.IDENTIFIER)) {
      value = this.previous().value;
    } else if (this.match(TokenType.WILDCARD)) {
      value = '*';
    } else if (this.match(TokenType.REGEX)) {
      operator = '~';
      value = this.previous().value;
    }

    return { field, operator, value, negate };
  }

  private parseStats(): StatsNode {
    this.consume(TokenType.STATS, 'Expected "stats"');
    const aggregations: Aggregation[] = [];
    const groupBy: string[] = [];

    // Parse aggregations
    while (!this.isAtEnd() && !this.check(TokenType.BY) && !this.check(TokenType.PIPE)) {
      const agg = this.parseAggregation();
      if (agg) aggregations.push(agg);

      this.match(TokenType.COMMA); // Optional comma
    }

    // Parse group by
    if (this.match(TokenType.BY)) {
      while (!this.isAtEnd() && !this.check(TokenType.PIPE)) {
        const field = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;
        groupBy.push(field);
        this.match(TokenType.COMMA); // Optional comma
      }
    }

    return { type: 'stats', aggregations, groupBy };
  }

  private parseAggregation(): Aggregation | null {
    const funcToken = this.peek();
    let func: AggregationFunction;

    switch (funcToken.type) {
      case TokenType.COUNT:
        func = 'count';
        break;
      case TokenType.SUM:
        func = 'sum';
        break;
      case TokenType.AVG:
        func = 'avg';
        break;
      case TokenType.MIN:
        func = 'min';
        break;
      case TokenType.MAX:
        func = 'max';
        break;
      case TokenType.DC:
        func = 'dc';
        break;
      case TokenType.VALUES:
        func = 'values';
        break;
      case TokenType.EARLIEST:
        func = 'earliest';
        break;
      case TokenType.LATEST:
        func = 'latest';
        break;
      default:
        return null;
    }

    this.advance();

    let field: string | null = null;
    let alias: string | undefined;

    // Parse optional parentheses with field
    if (this.match(TokenType.LPAREN)) {
      if (!this.check(TokenType.RPAREN)) {
        field = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;
      }
      this.consume(TokenType.RPAREN, 'Expected ")"');
    }

    // Parse optional alias
    if (this.match(TokenType.AS)) {
      alias = this.consume(TokenType.IDENTIFIER, 'Expected alias').value;
    }

    return { function: func, field, alias };
  }

  private parseSort(): SortNode {
    this.consume(TokenType.SORT, 'Expected "sort"');
    const fields: SortField[] = [];

    // Check for direction at the start
    let defaultDirection: 'asc' | 'desc' = 'asc';
    if (this.match(TokenType.DESC)) {
      defaultDirection = 'desc';
    } else if (this.match(TokenType.ASC)) {
      defaultDirection = 'asc';
    }

    // Parse fields
    while (!this.isAtEnd() && !this.check(TokenType.PIPE)) {
      if (this.check(TokenType.IDENTIFIER)) {
        const field = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;
        let direction = defaultDirection;

        if (this.match(TokenType.DESC)) {
          direction = 'desc';
        } else if (this.match(TokenType.ASC)) {
          direction = 'asc';
        }

        fields.push({ field, direction });
        this.match(TokenType.COMMA); // Optional comma
      } else {
        break;
      }
    }

    return { type: 'sort', fields };
  }

  private parseLimit(): LimitNode {
    this.match(TokenType.LIMIT) || this.match(TokenType.HEAD);
    const count = parseInt(
      this.consume(TokenType.NUMBER, 'Expected number').value,
      10
    );
    return { type: 'limit', count };
  }

  private parseTail(): LimitNode {
    this.consume(TokenType.TAIL, 'Expected "tail"');
    const count = parseInt(
      this.consume(TokenType.NUMBER, 'Expected number').value,
      10
    );
    // Tail is handled specially in the compiler
    return { type: 'limit', count };
  }

  private parseDedup(): DedupNode {
    this.consume(TokenType.DEDUP, 'Expected "dedup"');
    const fields: string[] = [];

    while (!this.isAtEnd() && !this.check(TokenType.PIPE)) {
      const field = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;
      fields.push(field);
      this.match(TokenType.COMMA);
    }

    return { type: 'dedup', fields };
  }

  private parseTable(): TableNode {
    this.consume(TokenType.TABLE, 'Expected "table"');
    const fields: string[] = [];

    while (!this.isAtEnd() && !this.check(TokenType.PIPE)) {
      const field = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;
      fields.push(field);
      this.match(TokenType.COMMA);
    }

    return { type: 'table', fields };
  }

  private parseFields(): FieldsNode {
    this.consume(TokenType.FIELDS, 'Expected "fields"');
    const fields: string[] = [];
    let include = true;

    // Check for - to exclude fields
    if (this.peek().value === '-') {
      this.advance();
      include = false;
    } else if (this.peek().value === '+') {
      this.advance();
      include = true;
    }

    while (!this.isAtEnd() && !this.check(TokenType.PIPE)) {
      const field = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;
      fields.push(field);
      this.match(TokenType.COMMA);
    }

    return { type: 'fields', include, fields };
  }

  private parseRename(): RenameNode {
    this.consume(TokenType.RENAME, 'Expected "rename"');
    const mappings: { from: string; to: string }[] = [];

    while (!this.isAtEnd() && !this.check(TokenType.PIPE)) {
      const from = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;
      this.consume(TokenType.AS, 'Expected "as"');
      const to = this.consume(TokenType.IDENTIFIER, 'Expected new field name').value;
      mappings.push({ from, to });
      this.match(TokenType.COMMA);
    }

    return { type: 'rename', mappings };
  }

  private parseEval(): EvalNode {
    this.consume(TokenType.EVAL, 'Expected "eval"');
    const assignments: { field: string; expression: string }[] = [];

    while (!this.isAtEnd() && !this.check(TokenType.PIPE)) {
      const field = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;
      this.consume(TokenType.EQUALS, 'Expected "="');

      // Collect expression tokens until comma or pipe
      let expression = '';
      let parenDepth = 0;

      while (!this.isAtEnd()) {
        if (this.check(TokenType.PIPE) && parenDepth === 0) break;
        if (this.check(TokenType.COMMA) && parenDepth === 0) break;

        if (this.check(TokenType.LPAREN)) parenDepth++;
        if (this.check(TokenType.RPAREN)) parenDepth--;

        expression += this.peek().value + ' ';
        this.advance();
      }

      assignments.push({ field, expression: expression.trim() });
      this.match(TokenType.COMMA);
    }

    return { type: 'eval', assignments };
  }

  // Helper methods

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.pos++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private previous(): Token {
    return this.tokens[this.pos - 1];
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new ParseError(message, this.peek().line, this.peek().column);
  }
}
