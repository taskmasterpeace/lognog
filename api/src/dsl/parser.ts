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
  TopNode,
  RareNode,
  BinNode,
  TimechartNode,
  RexNode,
  Condition,
  SimpleCondition,
  LogicGroup,
  Aggregation,
  SortField,
  ComparisonOperator,
  AggregationFunction,
  ParseError,
  EvalExpression,
  LiteralExpression,
  FieldRefExpression,
  FunctionCallExpression,
  BinaryOpExpression,
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
      case TokenType.TOP:
        return this.parseTop();
      case TokenType.RARE:
        return this.parseRare();
      case TokenType.BIN:
        return this.parseBin();
      case TokenType.TIMECHART:
        return this.parseTimechart();
      case TokenType.REX:
        return this.parseRex();
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

    // Parse OR-separated groups
    const orGroup = this.parseOrExpression();
    if (orGroup) {
      conditions.push(orGroup);
    }

    return conditions;
  }

  // OR has lower precedence than AND
  private parseOrExpression(): Condition | null {
    const left = this.parseAndExpression();
    if (!left) return null;

    const orTerms: Condition[] = [left];

    while (this.match(TokenType.OR)) {
      const right = this.parseAndExpression();
      if (right) {
        orTerms.push(right);
      }
    }

    if (orTerms.length === 1) {
      return orTerms[0];
    }

    return { logic: 'OR', conditions: orTerms };
  }

  // AND has higher precedence than OR
  private parseAndExpression(): Condition | null {
    const left = this.parsePrimaryCondition();
    if (!left) return null;

    const andTerms: Condition[] = [left];

    while (!this.isAtEnd() && !this.check(TokenType.PIPE) && !this.check(TokenType.OR)) {
      // Check for explicit AND or implicit AND (next condition)
      const hasExplicitAnd = this.match(TokenType.AND);

      // If we don't have explicit AND, check if next token looks like a condition
      if (!hasExplicitAnd && !this.isConditionStart()) {
        break;
      }

      const right = this.parsePrimaryCondition();
      if (right) {
        andTerms.push(right);
      } else {
        break;
      }
    }

    if (andTerms.length === 1) {
      return andTerms[0];
    }

    return { logic: 'AND', conditions: andTerms };
  }

  private isConditionStart(): boolean {
    return this.check(TokenType.NOT) ||
           this.check(TokenType.IDENTIFIER) ||
           this.check(TokenType.STRING) ||
           this.check(TokenType.LPAREN);
  }

  private parsePrimaryCondition(): Condition | null {
    // Handle wildcard * as "match all" - return a special condition
    // This allows queries like `search * hostname=value` to work
    if (this.match(TokenType.MULTIPLY)) {
      return { field: '_all', operator: '=', value: '*', negate: false };
    }

    // Handle parentheses for grouping
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseOrExpression();
      this.consume(TokenType.RPAREN, 'Expected ")"');
      return expr;
    }

    const negate = this.match(TokenType.NOT);

    if (this.check(TokenType.IDENTIFIER) || this.check(TokenType.STRING)) {
      return this.parseCondition(negate);
    }

    return null;
  }

  private parseCondition(negate: boolean): SimpleCondition | null {
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
    } else if (this.match(TokenType.MULTIPLY)) {
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
      case TokenType.MEDIAN:
        func = 'median';
        break;
      case TokenType.MODE:
        func = 'mode';
        break;
      case TokenType.STDDEV:
        func = 'stddev';
        break;
      case TokenType.VARIANCE:
        func = 'variance';
        break;
      case TokenType.RANGE:
        func = 'range';
        break;
      case TokenType.P50:
        func = 'p50';
        break;
      case TokenType.P90:
        func = 'p90';
        break;
      case TokenType.P95:
        func = 'p95';
        break;
      case TokenType.P99:
        func = 'p99';
        break;
      case TokenType.FIRST:
        func = 'first';
        break;
      case TokenType.LAST:
        func = 'last';
        break;
      case TokenType.LIST:
        func = 'list';
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
      // Allow both identifiers and aggregation function keywords as field names
      // (e.g., you might want to sort by a field called "count")
      if (this.check(TokenType.IDENTIFIER) ||
          this.check(TokenType.COUNT) || this.check(TokenType.SUM) ||
          this.check(TokenType.AVG) || this.check(TokenType.MIN) ||
          this.check(TokenType.MAX)) {
        const field = this.advance().value;
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
    const assignments: { field: string; expression: EvalExpression }[] = [];

    while (!this.isAtEnd() && !this.check(TokenType.PIPE)) {
      const field = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;
      this.consume(TokenType.EQUALS, 'Expected "="');

      const expression = this.parseEvalExpression();
      assignments.push({ field, expression });
      this.match(TokenType.COMMA);
    }

    return { type: 'eval', assignments };
  }

  // Parse eval expressions with operators
  private parseEvalExpression(): EvalExpression {
    return this.parseComparison();
  }

  // Parse comparison operators (for if statements)
  private parseComparison(): EvalExpression {
    let left = this.parseAdditive();

    while (
      this.check(TokenType.LESS_THAN) ||
      this.check(TokenType.LESS_THAN_EQ) ||
      this.check(TokenType.GREATER_THAN) ||
      this.check(TokenType.GREATER_THAN_EQ) ||
      this.check(TokenType.EQUALS) ||
      this.check(TokenType.NOT_EQUALS)
    ) {
      const opToken = this.advance();
      const right = this.parseAdditive();

      // For comparisons, we'll wrap them in a pseudo-binary expression
      // The compiler will handle this specially
      left = {
        type: 'function',
        name: '_cmp_' + opToken.value,
        args: [left, right]
      } as any;
    }

    return left;
  }

  // Parse addition/subtraction
  private parseAdditive(): EvalExpression {
    let left = this.parseMultiplicative();

    while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
      const op = this.advance().value as '+' | '-';
      const right = this.parseMultiplicative();
      left = { type: 'binary', operator: op, left, right };
    }

    return left;
  }

  // Parse multiplication/division/modulo
  private parseMultiplicative(): EvalExpression {
    let left = this.parseEvalPrimary();

    while (this.check(TokenType.MULTIPLY) || this.check(TokenType.DIVIDE) || this.check(TokenType.MODULO)) {
      const op = this.advance().value as '*' | '/' | '%';
      const right = this.parseEvalPrimary();
      left = { type: 'binary', operator: op, left, right };
    }

    return left;
  }

  // Parse primary eval expression (literals, fields, function calls, parentheses)
  private parseEvalPrimary(): EvalExpression {
    // Check for parentheses
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseEvalExpression();
      this.consume(TokenType.RPAREN, 'Expected ")"');
      return expr;
    }

    // Check for numbers
    if (this.check(TokenType.NUMBER)) {
      const value = parseFloat(this.advance().value);
      return { type: 'literal', value };
    }

    // Check for strings
    if (this.check(TokenType.STRING)) {
      const value = this.advance().value;
      return { type: 'literal', value };
    }

    // Check for identifiers (could be field or function)
    if (this.check(TokenType.IDENTIFIER)) {
      const name = this.advance().value;

      // Check if it's a function call
      if (this.check(TokenType.LPAREN)) {
        this.advance(); // consume (
        const args: EvalExpression[] = [];

        // Parse arguments
        if (!this.check(TokenType.RPAREN)) {
          args.push(this.parseEvalExpression());

          while (this.match(TokenType.COMMA)) {
            args.push(this.parseEvalExpression());
          }
        }

        this.consume(TokenType.RPAREN, 'Expected ")"');
        return { type: 'function', name: name.toLowerCase(), args };
      }

      // Otherwise it's a field reference
      return { type: 'field', name };
    }

    throw new ParseError(
      `Expected expression, got '${this.peek().value}'`,
      this.peek().line,
      this.peek().column
    );
  }

  private parseTop(): TopNode {
    this.consume(TokenType.TOP, 'Expected "top"');

    // Parse limit number
    const limit = parseInt(
      this.consume(TokenType.NUMBER, 'Expected number').value,
      10
    );

    // Parse field
    const field = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;

    // Optional: by count (default behavior, so we can ignore it)
    if (this.match(TokenType.BY)) {
      const byField = this.peek().value;
      if (byField.toLowerCase() === 'count') {
        this.advance(); // consume 'count'
      }
    }

    return { type: 'top', limit, field };
  }

  private parseRare(): RareNode {
    this.consume(TokenType.RARE, 'Expected "rare"');

    // Parse limit number
    const limit = parseInt(
      this.consume(TokenType.NUMBER, 'Expected number').value,
      10
    );

    // Parse field
    const field = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;

    return { type: 'rare', limit, field };
  }

  private parseBin(): BinNode {
    this.consume(TokenType.BIN, 'Expected "bin"');

    // Parse span=<value>
    this.consume(TokenType.SPAN, 'Expected "span"');
    this.consume(TokenType.EQUALS, 'Expected "="');

    // Parse span value (could be time like "1h" or number like 100)
    let span: string | number;
    if (this.check(TokenType.NUMBER)) {
      const numStr = this.advance().value;
      // Check if followed by a time unit identifier
      if (this.check(TokenType.IDENTIFIER)) {
        const unit = this.peek().value;
        if (/^[smhd]$/.test(unit)) {
          span = numStr + unit;
          this.advance();
        } else {
          span = parseFloat(numStr);
        }
      } else {
        span = parseFloat(numStr);
      }
    } else if (this.check(TokenType.IDENTIFIER)) {
      // Could be something like "1h" parsed as identifier
      span = this.advance().value;
    } else if (this.check(TokenType.STRING)) {
      span = this.advance().value;
    } else {
      throw new ParseError('Expected span value', this.peek().line, this.peek().column);
    }

    // Parse field
    const field = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;

    return { type: 'bin', field, span };
  }

  private parseTimechart(): TimechartNode {
    this.consume(TokenType.TIMECHART, 'Expected "timechart"');

    // Parse span=<value>
    this.consume(TokenType.SPAN, 'Expected "span"');
    this.consume(TokenType.EQUALS, 'Expected "="');

    // Parse span value (time like "1h")
    let span: string;
    if (this.check(TokenType.NUMBER)) {
      const numStr = this.advance().value;
      // Check if followed by a time unit identifier
      if (this.check(TokenType.IDENTIFIER)) {
        const unit = this.peek().value;
        if (/^[smhd]$/.test(unit)) {
          span = numStr + unit;
          this.advance();
        } else {
          span = numStr + 'h'; // default to hours
        }
      } else {
        span = numStr + 'h'; // default to hours
      }
    } else if (this.check(TokenType.IDENTIFIER)) {
      span = this.advance().value;
    } else if (this.check(TokenType.STRING)) {
      span = this.advance().value;
    } else {
      throw new ParseError('Expected span value', this.peek().line, this.peek().column);
    }

    // Parse aggregations (similar to stats)
    const aggregations: Aggregation[] = [];
    while (!this.isAtEnd() && !this.check(TokenType.BY) && !this.check(TokenType.PIPE)) {
      const agg = this.parseAggregation();
      if (agg) aggregations.push(agg);
      this.match(TokenType.COMMA);
    }

    // Parse optional group by
    let groupBy: string | undefined;
    if (this.match(TokenType.BY)) {
      groupBy = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;
    }

    return { type: 'timechart', span, aggregations, groupBy };
  }

  private parseRex(): RexNode {
    this.consume(TokenType.REX, 'Expected "rex"');

    // Parse optional field=<fieldname>
    let field = 'message'; // default field
    if (this.match(TokenType.FIELD)) {
      this.consume(TokenType.EQUALS, 'Expected "="');
      field = this.consume(TokenType.IDENTIFIER, 'Expected field name').value;
    }

    // Parse regex pattern (could be string or regex literal)
    let pattern: string;
    if (this.check(TokenType.STRING)) {
      pattern = this.advance().value;
    } else if (this.check(TokenType.REGEX)) {
      pattern = this.advance().value;
    } else {
      throw new ParseError('Expected regex pattern', this.peek().line, this.peek().column);
    }

    return { type: 'rex', field, pattern };
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
