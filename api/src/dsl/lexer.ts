import { Token, TokenType, ParseError } from './types.js';

const KEYWORDS: Record<string, TokenType> = {
  'search': TokenType.SEARCH,
  'filter': TokenType.FILTER,
  'stats': TokenType.STATS,
  'sort': TokenType.SORT,
  'limit': TokenType.LIMIT,
  'head': TokenType.HEAD,
  'tail': TokenType.TAIL,
  'dedup': TokenType.DEDUP,
  'table': TokenType.TABLE,
  'fields': TokenType.FIELDS,
  'rename': TokenType.RENAME,
  'eval': TokenType.EVAL,
  'where': TokenType.WHERE,
  'by': TokenType.BY,
  'as': TokenType.AS,
  'and': TokenType.AND,
  'or': TokenType.OR,
  'not': TokenType.NOT,
  'asc': TokenType.ASC,
  'desc': TokenType.DESC,
  // Aggregation functions
  'count': TokenType.COUNT,
  'sum': TokenType.SUM,
  'avg': TokenType.AVG,
  'min': TokenType.MIN,
  'max': TokenType.MAX,
  'dc': TokenType.DC,
  'values': TokenType.VALUES,
  'earliest': TokenType.EARLIEST,
  'latest': TokenType.LATEST,
};

export class Lexer {
  private input: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(input: string) {
    this.input = input;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      this.skipWhitespace();
      if (this.isAtEnd()) break;

      const token = this.nextToken();
      if (token) {
        tokens.push(token);
      }
    }

    tokens.push(this.makeToken(TokenType.EOF, ''));
    return tokens;
  }

  private nextToken(): Token | null {
    const char = this.peek();

    // Single character tokens
    switch (char) {
      case '|':
        return this.advance() && this.makeToken(TokenType.PIPE, '|');
      case ',':
        return this.advance() && this.makeToken(TokenType.COMMA, ',');
      case '(':
        return this.advance() && this.makeToken(TokenType.LPAREN, '(');
      case ')':
        return this.advance() && this.makeToken(TokenType.RPAREN, ')');
      case '~':
        return this.advance() && this.makeToken(TokenType.CONTAINS, '~');
    }

    // Comparison operators
    if (char === '=') {
      this.advance();
      return this.makeToken(TokenType.EQUALS, '=');
    }

    if (char === '!') {
      this.advance();
      if (this.peek() === '=') {
        this.advance();
        return this.makeToken(TokenType.NOT_EQUALS, '!=');
      }
      throw new ParseError(`Unexpected character '!'`, this.line, this.column);
    }

    if (char === '<') {
      this.advance();
      if (this.peek() === '=') {
        this.advance();
        return this.makeToken(TokenType.LESS_THAN_EQ, '<=');
      }
      return this.makeToken(TokenType.LESS_THAN, '<');
    }

    if (char === '>') {
      this.advance();
      if (this.peek() === '=') {
        this.advance();
        return this.makeToken(TokenType.GREATER_THAN_EQ, '>=');
      }
      return this.makeToken(TokenType.GREATER_THAN, '>');
    }

    // String literals
    if (char === '"' || char === "'") {
      return this.readString(char);
    }

    // Regex literals
    if (char === '/') {
      return this.readRegex();
    }

    // Numbers
    if (this.isDigit(char) || (char === '-' && this.isDigit(this.peekNext()))) {
      return this.readNumber();
    }

    // Identifiers and keywords
    if (this.isIdentifierStart(char)) {
      return this.readIdentifier();
    }

    // Wildcard
    if (char === '*') {
      this.advance();
      return this.makeToken(TokenType.WILDCARD, '*');
    }

    throw new ParseError(`Unexpected character '${char}'`, this.line, this.column);
  }

  private readString(quote: string): Token {
    const startLine = this.line;
    const startColumn = this.column;
    this.advance(); // consume opening quote

    let value = '';
    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\' && this.peekNext() === quote) {
        this.advance(); // skip backslash
        value += this.peek();
        this.advance();
      } else {
        value += this.peek();
        this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw new ParseError('Unterminated string', startLine, startColumn);
    }

    this.advance(); // consume closing quote
    return { type: TokenType.STRING, value, line: startLine, column: startColumn };
  }

  private readRegex(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    this.advance(); // consume opening /

    let value = '';
    while (!this.isAtEnd() && this.peek() !== '/') {
      if (this.peek() === '\\') {
        value += this.peek();
        this.advance();
        if (!this.isAtEnd()) {
          value += this.peek();
          this.advance();
        }
      } else {
        value += this.peek();
        this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw new ParseError('Unterminated regex', startLine, startColumn);
    }

    this.advance(); // consume closing /
    return { type: TokenType.REGEX, value, line: startLine, column: startColumn };
  }

  private readNumber(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    let value = '';

    if (this.peek() === '-') {
      value += this.peek();
      this.advance();
    }

    while (!this.isAtEnd() && this.isDigit(this.peek())) {
      value += this.peek();
      this.advance();
    }

    // Decimal part
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      value += this.peek();
      this.advance();
      while (!this.isAtEnd() && this.isDigit(this.peek())) {
        value += this.peek();
        this.advance();
      }
    }

    return { type: TokenType.NUMBER, value, line: startLine, column: startColumn };
  }

  private readIdentifier(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    let value = '';

    while (!this.isAtEnd() && this.isIdentifierChar(this.peek())) {
      value += this.peek();
      this.advance();
    }

    const lower = value.toLowerCase();
    const type = KEYWORDS[lower] || TokenType.IDENTIFIER;

    return { type, value, line: startLine, column: startColumn };
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char === ' ' || char === '\t' || char === '\r') {
        this.advance();
      } else if (char === '\n') {
        this.line++;
        this.column = 0;
        this.advance();
      } else if (char === '#') {
        // Comment - skip to end of line
        while (!this.isAtEnd() && this.peek() !== '\n') {
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  private peek(): string {
    return this.input[this.pos] || '\0';
  }

  private peekNext(): string {
    return this.input[this.pos + 1] || '\0';
  }

  private advance(): true {
    this.pos++;
    this.column++;
    return true;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.input.length;
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isIdentifierStart(char: string): boolean {
    return (char >= 'a' && char <= 'z') ||
           (char >= 'A' && char <= 'Z') ||
           char === '_';
  }

  private isIdentifierChar(char: string): boolean {
    return this.isIdentifierStart(char) ||
           this.isDigit(char) ||
           char === '.' ||
           char === '-';
  }

  private makeToken(type: TokenType, value: string): Token {
    return { type, value, line: this.line, column: this.column - value.length };
  }
}
