import { describe, it, expect } from 'vitest';
import { parseToAST } from './index.js';
import type { SimpleCondition } from './types.js';

/**
 * `stats count by host` produces a column literally named `count`; the lexer
 * classifies `count` (and every other aggregation name) as a keyword, which
 * used to make `where count > 100` a parse error.
 */
describe('aggregation names as field names in conditions', () => {
  it('parses where count > N after stats', () => {
    const ast = parseToAST('search * | stats count by hostname | where count > 100');
    const where = ast.stages[ast.stages.length - 1] as unknown as { type: string; conditions: SimpleCondition[] };
    expect(where.type).toBe('where');
    expect(where.conditions[0]).toMatchObject({ field: 'count', operator: '>', value: 100 });
  });

  it('parses avg / max / p95 columns and combinations', () => {
    const ast = parseToAST('search * | stats avg(latency), max(latency), p95(latency) by app | where avg > 200 AND max < 5000 OR p95 >= 1000');
    const where = ast.stages[ast.stages.length - 1] as unknown as { type: string; conditions: unknown[] };
    expect(where.type).toBe('where');
    expect(where.conditions).toHaveLength(1);
  });

  it('still parses a plain search with identifiers and quoted phrases', () => {
    const ast = parseToAST('search hostname=web-01 "timed out"');
    expect(ast.stages[0].type).toBe('search');
  });
});
