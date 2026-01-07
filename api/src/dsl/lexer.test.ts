import { describe, it, expect } from 'vitest';
import { Lexer } from './lexer';
import { TokenType } from './types';

describe('Lexer', () => {
  it('tokenizes simple search query', () => {
    const lexer = new Lexer('search host=router');
    const tokens = lexer.tokenize();

    expect(tokens).toHaveLength(5);
    expect(tokens[0].type).toBe(TokenType.SEARCH);
    expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[1].value).toBe('host');
    expect(tokens[2].type).toBe(TokenType.EQUALS);
    expect(tokens[3].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[3].value).toBe('router');
    expect(tokens[4].type).toBe(TokenType.EOF);
  });

  it('tokenizes query with pipe', () => {
    const lexer = new Lexer('search * | stats count by hostname');
    const tokens = lexer.tokenize();

    expect(tokens.map(t => t.type)).toEqual([
      TokenType.SEARCH,
      TokenType.MULTIPLY, // * is now MULTIPLY instead of WILDCARD
      TokenType.PIPE,
      TokenType.STATS,
      TokenType.COUNT,
      TokenType.BY,
      TokenType.IDENTIFIER,
      TokenType.EOF,
    ]);
  });

  it('tokenizes string literals', () => {
    const lexer = new Lexer('search message="hello world"');
    const tokens = lexer.tokenize();

    expect(tokens[3].type).toBe(TokenType.STRING);
    expect(tokens[3].value).toBe('hello world');
  });

  it('tokenizes numbers', () => {
    const lexer = new Lexer('search severity>=3');
    const tokens = lexer.tokenize();

    expect(tokens[2].type).toBe(TokenType.GREATER_THAN_EQ);
    expect(tokens[3].type).toBe(TokenType.NUMBER);
    expect(tokens[3].value).toBe('3');
  });

  it('tokenizes comparison operators', () => {
    const lexer = new Lexer('a=1 b!=2 c<3 d<=4 e>5 f>=6 g~test');
    const tokens = lexer.tokenize();

    const operators = tokens.filter(t =>
      [TokenType.EQUALS, TokenType.NOT_EQUALS, TokenType.LESS_THAN,
       TokenType.LESS_THAN_EQ, TokenType.GREATER_THAN, TokenType.GREATER_THAN_EQ,
       TokenType.CONTAINS].includes(t.type)
    );

    expect(operators.map(t => t.type)).toEqual([
      TokenType.EQUALS,
      TokenType.NOT_EQUALS,
      TokenType.LESS_THAN,
      TokenType.LESS_THAN_EQ,
      TokenType.GREATER_THAN,
      TokenType.GREATER_THAN_EQ,
      TokenType.CONTAINS,
    ]);
  });

  it('tokenizes aggregation functions', () => {
    const lexer = new Lexer('stats count sum(bytes) avg(latency) max(duration)');
    const tokens = lexer.tokenize();

    expect(tokens[0].type).toBe(TokenType.STATS);
    expect(tokens[1].type).toBe(TokenType.COUNT);
    expect(tokens[2].type).toBe(TokenType.SUM);
    // tokens[3] = LPAREN, tokens[4] = bytes, tokens[5] = RPAREN
    expect(tokens[6].type).toBe(TokenType.AVG);
    // tokens[7] = LPAREN, tokens[8] = latency, tokens[9] = RPAREN
    expect(tokens[10].type).toBe(TokenType.MAX);
  });

  it('handles whitespace and newlines', () => {
    const lexer = new Lexer(`search host=router
      | stats count`);
    const tokens = lexer.tokenize();

    // search, host, =, router, |, stats, count = 7 tokens
    expect(tokens.filter(t => t.type !== TokenType.EOF)).toHaveLength(7);
  });

  it('skips comments', () => {
    const lexer = new Lexer('search * # this is a comment\n| limit 10');
    const tokens = lexer.tokenize();

    expect(tokens.map(t => t.type)).toEqual([
      TokenType.SEARCH,
      TokenType.MULTIPLY, // * is now MULTIPLY instead of WILDCARD
      TokenType.PIPE,
      TokenType.LIMIT,
      TokenType.NUMBER,
      TokenType.EOF,
    ]);
  });

  it('tokenizes Splunk-style colon operator as contains', () => {
    const lexer = new Lexer('search message:"error"');
    const tokens = lexer.tokenize();

    expect(tokens[2].type).toBe(TokenType.CONTAINS);
    expect(tokens[2].value).toBe(':');
    expect(tokens[3].type).toBe(TokenType.STRING);
    expect(tokens[3].value).toBe('error');
  });

  it('tokenizes both tilde and colon as contains', () => {
    const lexer = new Lexer('a~"test" b:"test"');
    const tokens = lexer.tokenize();

    const containsTokens = tokens.filter(t => t.type === TokenType.CONTAINS);
    expect(containsTokens).toHaveLength(2);
    expect(containsTokens[0].value).toBe('~');
    expect(containsTokens[1].value).toBe(':');
  });
});
