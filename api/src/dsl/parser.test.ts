import { describe, it, expect } from 'vitest';
import { Lexer } from './lexer';
import { Parser } from './parser';

function parse(query: string) {
  const lexer = new Lexer(query);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

describe('Parser', () => {
  it('parses simple search', () => {
    const ast = parse('search host=router');

    expect(ast.stages).toHaveLength(1);
    expect(ast.stages[0].type).toBe('search');

    const search = ast.stages[0] as { type: 'search'; conditions: { field: string; operator: string; value: string }[] };
    expect(search.conditions).toHaveLength(1);
    expect(search.conditions[0].field).toBe('host');
    expect(search.conditions[0].operator).toBe('=');
    expect(search.conditions[0].value).toBe('router');
  });

  it('parses multiple conditions', () => {
    const ast = parse('search host=router severity>=warning');

    const search = ast.stages[0] as { type: 'search'; conditions: { field: string }[] };
    expect(search.conditions).toHaveLength(2);
  });

  it('parses stats with group by', () => {
    const ast = parse('search * | stats count by hostname');

    expect(ast.stages).toHaveLength(2);
    expect(ast.stages[1].type).toBe('stats');

    const stats = ast.stages[1] as { type: 'stats'; aggregations: { function: string }[]; groupBy: string[] };
    expect(stats.aggregations).toHaveLength(1);
    expect(stats.aggregations[0].function).toBe('count');
    expect(stats.groupBy).toEqual(['hostname']);
  });

  it('parses multiple aggregations', () => {
    const ast = parse('search * | stats count sum(bytes) avg(latency) by hostname');

    const stats = ast.stages[1] as { type: 'stats'; aggregations: { function: string; field: string | null }[] };
    expect(stats.aggregations).toHaveLength(3);
    expect(stats.aggregations[0].function).toBe('count');
    expect(stats.aggregations[1].function).toBe('sum');
    expect(stats.aggregations[1].field).toBe('bytes');
    expect(stats.aggregations[2].function).toBe('avg');
    expect(stats.aggregations[2].field).toBe('latency');
  });

  it('parses sort', () => {
    const ast = parse('search * | sort desc timestamp');

    expect(ast.stages[1].type).toBe('sort');

    const sort = ast.stages[1] as { type: 'sort'; fields: { field: string; direction: string }[] };
    expect(sort.fields).toHaveLength(1);
    expect(sort.fields[0].field).toBe('timestamp');
    expect(sort.fields[0].direction).toBe('desc');
  });

  it('parses limit', () => {
    const ast = parse('search * | limit 100');

    expect(ast.stages[1].type).toBe('limit');

    const limit = ast.stages[1] as { type: 'limit'; count: number };
    expect(limit.count).toBe(100);
  });

  it('parses dedup', () => {
    const ast = parse('search * | dedup hostname app_name');

    expect(ast.stages[1].type).toBe('dedup');

    const dedup = ast.stages[1] as { type: 'dedup'; fields: string[] };
    expect(dedup.fields).toEqual(['hostname', 'app_name']);
  });

  it('parses table', () => {
    const ast = parse('search * | table timestamp hostname message');

    expect(ast.stages[1].type).toBe('table');

    const table = ast.stages[1] as { type: 'table'; fields: string[] };
    expect(table.fields).toEqual(['timestamp', 'hostname', 'message']);
  });

  it('parses complex query', () => {
    const ast = parse(`
      search host=router severity>=warning
      | filter app~"firewall"
      | stats count by source_ip
      | sort desc
      | limit 10
    `);

    expect(ast.stages).toHaveLength(5);
    expect(ast.stages[0].type).toBe('search');
    expect(ast.stages[1].type).toBe('filter');
    expect(ast.stages[2].type).toBe('stats');
    expect(ast.stages[3].type).toBe('sort');
    expect(ast.stages[4].type).toBe('limit');
  });

  it('parses rename', () => {
    const ast = parse('search * | rename hostname as host, app_name as app');

    expect(ast.stages[1].type).toBe('rename');

    const rename = ast.stages[1] as { type: 'rename'; mappings: { from: string; to: string }[] };
    expect(rename.mappings).toHaveLength(2);
    expect(rename.mappings[0]).toEqual({ from: 'hostname', to: 'host' });
    expect(rename.mappings[1]).toEqual({ from: 'app_name', to: 'app' });
  });
});
