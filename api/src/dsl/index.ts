import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import { Compiler, compileDSL } from './compiler.js';
import { QueryAST, CompiledQuery, ParseError } from './types.js';

export * from './types.js';
export { Lexer } from './lexer.js';
export { Parser } from './parser.js';
export { Compiler, compileDSL } from './compiler.js';

/**
 * Parse and compile a DSL query to ClickHouse SQL
 */
export function parseAndCompile(query: string): CompiledQuery {
  // Tokenize
  const lexer = new Lexer(query);
  const tokens = lexer.tokenize();

  // Parse
  const parser = new Parser(tokens);
  const ast = parser.parse();

  // Compile
  return compileDSL(ast);
}

/**
 * Parse DSL query to AST (for inspection/debugging)
 */
export function parseToAST(query: string): QueryAST {
  const lexer = new Lexer(query);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

/**
 * Validate a DSL query without compiling
 */
export function validateQuery(query: string): { valid: boolean; error?: string } {
  try {
    parseAndCompile(query);
    return { valid: true };
  } catch (error) {
    if (error instanceof ParseError) {
      return {
        valid: false,
        error: error.message,
      };
    }
    return {
      valid: false,
      error: String(error),
    };
  }
}
