import { describe, it, expect } from 'vitest';
import { compileDSLToSQLite } from './compiler-sqlite';
import { parseToAST } from './index';

describe('SQLiteCompiler - read-side index scoping (allowedIndexes)', () => {
  it('appends index_name IN clause for a single allowed index', () => {
    const ast = parseToAST('search severity>=warning');
    const result = compileDSLToSQLite(ast, ['foo']);
    expect(result.sql).toContain("index_name IN ('foo')");
  });

  it('lowercases and includes all allowed indexes', () => {
    const ast = parseToAST('search *');
    const result = compileDSLToSQLite(ast, ['Foo', 'Bar']);
    expect(result.sql).toContain("index_name IN ('foo','bar')");
  });

  it('does not inject index_name IN for undefined allowedIndexes', () => {
    const ast = parseToAST('search host=router');
    const result = compileDSLToSQLite(ast);
    expect(result.sql).not.toContain('index_name IN');
  });

  it('does not inject index_name IN for empty allowedIndexes', () => {
    const ast = parseToAST('search host=router');
    const result = compileDSLToSQLite(ast, []);
    expect(result.sql).not.toContain('index_name IN');
  });

  it('escapes single quotes in index values', () => {
    const ast = parseToAST('search *');
    const result = compileDSLToSQLite(ast, ["o'brien"]);
    expect(result.sql).toContain("index_name IN ('o''brien')");
  });

  it('applies to bare wildcard queries (no real filter)', () => {
    const ast = parseToAST('search * | stats count');
    const result = compileDSLToSQLite(ast, ['alpha']);
    expect(result.sql).toContain("index_name IN ('alpha')");
  });

  it('applies to the empty (zero-stage) default query', () => {
    const ast = parseToAST('');
    const result = compileDSLToSQLite(ast, ['alpha']);
    expect(result.sql).toContain("index_name IN ('alpha')");
    expect(result.sql).toContain('WHERE');
  });

  it('applies to stats aggregation queries', () => {
    const ast = parseToAST('search * | stats count by hostname');
    const result = compileDSLToSQLite(ast, ['alpha']);
    expect(result.sql).toContain("index_name IN ('alpha')");
    expect(result.sql).toContain('GROUP BY');
  });

  it('applies to timechart queries', () => {
    const ast = parseToAST('search * | timechart span=1h count');
    const result = compileDSLToSQLite(ast, ['alpha']);
    expect(result.sql).toContain("index_name IN ('alpha')");
  });

  it('ANDs the index filter with existing user WHERE conditions', () => {
    const ast = parseToAST('search host=router');
    const result = compileDSLToSQLite(ast, ['alpha']);
    expect(result.sql).toContain('WHERE');
    expect(result.sql).toContain("hostname = 'router'");
    expect(result.sql).toContain("index_name IN ('alpha')");
  });
});
