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

    const search = ast.stages[0] as { type: 'search'; conditions: any[] };
    expect(search.conditions).toHaveLength(1);

    // Multiple conditions are grouped as AND
    const andCondition = search.conditions[0];
    expect(andCondition.logic).toBe('AND');
    expect(andCondition.conditions).toHaveLength(2);
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

  // OR/AND Logic Tests
  it('parses simple OR condition', () => {
    const ast = parse('search host=web1 OR host=web2');

    expect(ast.stages).toHaveLength(1);
    expect(ast.stages[0].type).toBe('search');

    const search = ast.stages[0] as { type: 'search'; conditions: any[] };
    expect(search.conditions).toHaveLength(1);

    const condition = search.conditions[0];
    expect(condition.logic).toBe('OR');
    expect(condition.conditions).toHaveLength(2);
    expect(condition.conditions[0].field).toBe('host');
    expect(condition.conditions[0].value).toBe('web1');
    expect(condition.conditions[1].field).toBe('host');
    expect(condition.conditions[1].value).toBe('web2');
  });

  it('parses simple AND condition', () => {
    const ast = parse('search host=web1 AND severity=error');

    expect(ast.stages).toHaveLength(1);
    const search = ast.stages[0] as { type: 'search'; conditions: any[] };
    expect(search.conditions).toHaveLength(1);

    const condition = search.conditions[0];
    expect(condition.logic).toBe('AND');
    expect(condition.conditions).toHaveLength(2);
    expect(condition.conditions[0].field).toBe('host');
    expect(condition.conditions[1].field).toBe('severity');
  });

  it('parses implicit AND condition', () => {
    const ast = parse('search host=web1 severity=error');

    expect(ast.stages).toHaveLength(1);
    const search = ast.stages[0] as { type: 'search'; conditions: any[] };
    expect(search.conditions).toHaveLength(1);

    const condition = search.conditions[0];
    expect(condition.logic).toBe('AND');
    expect(condition.conditions).toHaveLength(2);
  });

  it('parses OR with higher precedence AND groups', () => {
    const ast = parse('search host=web1 severity=error OR host=web2 severity=warning');

    const search = ast.stages[0] as { type: 'search'; conditions: any[] };
    const orCondition = search.conditions[0];

    expect(orCondition.logic).toBe('OR');
    expect(orCondition.conditions).toHaveLength(2);

    // Each OR branch should be an AND group
    expect(orCondition.conditions[0].logic).toBe('AND');
    expect(orCondition.conditions[1].logic).toBe('AND');
  });

  it('parses parenthesized OR with AND', () => {
    const ast = parse('search (host=web1 OR host=web2) AND severity=error');

    const search = ast.stages[0] as { type: 'search'; conditions: any[] };
    const andCondition = search.conditions[0];

    expect(andCondition.logic).toBe('AND');
    expect(andCondition.conditions).toHaveLength(2);

    // First condition should be the OR group
    expect(andCondition.conditions[0].logic).toBe('OR');
    // Second should be simple condition
    expect(andCondition.conditions[1].field).toBe('severity');
  });

  it('parses multiple OR terms', () => {
    const ast = parse('search host=web1 OR host=web2 OR host=web3');

    const search = ast.stages[0] as { type: 'search'; conditions: any[] };
    const orCondition = search.conditions[0];

    expect(orCondition.logic).toBe('OR');
    expect(orCondition.conditions).toHaveLength(3);
  });

  it('parses complex mixed OR/AND expression', () => {
    const ast = parse('search (host=web1 OR host=web2) AND (severity=error OR severity=critical)');

    const search = ast.stages[0] as { type: 'search'; conditions: any[] };
    const andCondition = search.conditions[0];

    expect(andCondition.logic).toBe('AND');
    expect(andCondition.conditions).toHaveLength(2);

    // Both should be OR groups
    expect(andCondition.conditions[0].logic).toBe('OR');
    expect(andCondition.conditions[1].logic).toBe('OR');
  });

  // New command tests
  it('parses top command', () => {
    const ast = parse('search * | top 10 hostname');

    expect(ast.stages).toHaveLength(2);
    expect(ast.stages[1].type).toBe('top');

    const top = ast.stages[1] as { type: 'top'; limit: number; field: string };
    expect(top.limit).toBe(10);
    expect(top.field).toBe('hostname');
  });

  it('parses rare command', () => {
    const ast = parse('search * | rare 5 app_name');

    expect(ast.stages).toHaveLength(2);
    expect(ast.stages[1].type).toBe('rare');

    const rare = ast.stages[1] as { type: 'rare'; limit: number; field: string };
    expect(rare.limit).toBe(5);
    expect(rare.field).toBe('app_name');
  });

  it('parses bin command with time span', () => {
    const ast = parse('search * | bin span=1h timestamp');

    expect(ast.stages).toHaveLength(2);
    expect(ast.stages[1].type).toBe('bin');

    const bin = ast.stages[1] as { type: 'bin'; span: string | number; field: string };
    expect(bin.span).toBe('1h');
    expect(bin.field).toBe('timestamp');
  });

  it('parses bin command with numeric span', () => {
    const ast = parse('search * | bin span=100 bytes');

    expect(ast.stages).toHaveLength(2);
    expect(ast.stages[1].type).toBe('bin');

    const bin = ast.stages[1] as { type: 'bin'; span: string | number; field: string };
    expect(bin.span).toBe(100);
    expect(bin.field).toBe('bytes');
  });

  it('parses bucket as alias for bin', () => {
    const ast = parse('search * | bucket span=1h timestamp');

    expect(ast.stages).toHaveLength(2);
    expect(ast.stages[1].type).toBe('bin');

    const bin = ast.stages[1] as { type: 'bin'; span: string | number; field: string };
    expect(bin.span).toBe('1h');
    expect(bin.field).toBe('timestamp');
  });

  it('parses filldown command with fields', () => {
    const ast = parse('search * | filldown hostname, app_name');

    expect(ast.stages).toHaveLength(2);
    expect(ast.stages[1].type).toBe('filldown');

    const filldown = ast.stages[1] as { type: 'filldown'; fields: string[] };
    expect(filldown.fields).toEqual(['hostname', 'app_name']);
  });

  it('parses filldown command without fields', () => {
    const ast = parse('search * | filldown');

    expect(ast.stages).toHaveLength(2);
    expect(ast.stages[1].type).toBe('filldown');

    const filldown = ast.stages[1] as { type: 'filldown'; fields: string[] };
    expect(filldown.fields).toEqual([]);
  });

  it('parses timechart command', () => {
    const ast = parse('search * | timechart span=1h count');

    expect(ast.stages).toHaveLength(2);
    expect(ast.stages[1].type).toBe('timechart');

    const timechart = ast.stages[1] as { type: 'timechart'; span: string; aggregations: any[] };
    expect(timechart.span).toBe('1h');
    expect(timechart.aggregations).toHaveLength(1);
    expect(timechart.aggregations[0].function).toBe('count');
  });

  it('parses timechart with split-by field', () => {
    const ast = parse('search * | timechart span=5m count by hostname');

    expect(ast.stages[1].type).toBe('timechart');

    const timechart = ast.stages[1] as { type: 'timechart'; span: string; groupBy?: string };
    expect(timechart.span).toBe('5m');
    expect(timechart.groupBy).toBe('hostname');
  });

  it('parses rex command with field', () => {
    const ast = parse('search * | rex field=message "user=(?P<username>\\w+)"');

    expect(ast.stages).toHaveLength(2);
    expect(ast.stages[1].type).toBe('rex');

    const rex = ast.stages[1] as { type: 'rex'; field: string; pattern: string };
    expect(rex.field).toBe('message');
    expect(rex.pattern).toContain('username');
  });

  it('parses rex command without field', () => {
    const ast = parse('search * | rex "error: (?P<error_code>\\d+)"');

    expect(ast.stages[1].type).toBe('rex');

    const rex = ast.stages[1] as { type: 'rex'; field: string; pattern: string };
    expect(rex.field).toBe('message'); // default field
    expect(rex.pattern).toContain('error_code');
  });

  it('parses complex query with new commands', () => {
    const ast = parse(`
      search severity>=warning
      | bin span=1h timestamp
      | top 10 hostname
    `);

    expect(ast.stages).toHaveLength(3);
    expect(ast.stages[0].type).toBe('search');
    expect(ast.stages[1].type).toBe('bin');
    expect(ast.stages[2].type).toBe('top');
  });

  // Splunk-style sort syntax tests
  it('parses Splunk-style sort -field for descending', () => {
    const ast = parse('search * | sort -count');

    expect(ast.stages[1].type).toBe('sort');

    const sort = ast.stages[1] as { type: 'sort'; fields: { field: string; direction: string }[] };
    expect(sort.fields).toHaveLength(1);
    expect(sort.fields[0].field).toBe('count');
    expect(sort.fields[0].direction).toBe('desc');
  });

  it('parses Splunk-style sort +field for ascending', () => {
    const ast = parse('search * | sort +timestamp');

    expect(ast.stages[1].type).toBe('sort');

    const sort = ast.stages[1] as { type: 'sort'; fields: { field: string; direction: string }[] };
    expect(sort.fields).toHaveLength(1);
    expect(sort.fields[0].field).toBe('timestamp');
    expect(sort.fields[0].direction).toBe('asc');
  });

  it('parses Splunk-style sort with multiple fields', () => {
    const ast = parse('search * | sort -count +hostname');

    expect(ast.stages[1].type).toBe('sort');

    const sort = ast.stages[1] as { type: 'sort'; fields: { field: string; direction: string }[] };
    expect(sort.fields).toHaveLength(2);
    expect(sort.fields[0].field).toBe('count');
    expect(sort.fields[0].direction).toBe('desc');
    expect(sort.fields[1].field).toBe('hostname');
    expect(sort.fields[1].direction).toBe('asc');
  });

  it('parses colon operator as contains', () => {
    const ast = parse('search message:"error"');

    expect(ast.stages).toHaveLength(1);
    expect(ast.stages[0].type).toBe('search');

    const search = ast.stages[0] as { type: 'search'; conditions: any[] };
    expect(search.conditions).toHaveLength(1);
    expect(search.conditions[0].field).toBe('message');
    expect(search.conditions[0].operator).toBe('~');
    expect(search.conditions[0].value).toBe('error');
  });

  // Compare command tests
  it('parses compare with offset', () => {
    const ast = parse('search * | timechart span=1h count | compare 1d');

    expect(ast.stages).toHaveLength(3);
    expect(ast.stages[2].type).toBe('compare');

    const compare = ast.stages[2] as { type: 'compare'; offset: string };
    expect(compare.offset).toBe('1d');
  });

  it('parses compare with week offset', () => {
    const ast = parse('search * | stats count by hostname | compare 1w');

    expect(ast.stages).toHaveLength(3);
    expect(ast.stages[2].type).toBe('compare');

    const compare = ast.stages[2] as { type: 'compare'; offset: string };
    expect(compare.offset).toBe('1w');
  });

  it('parses compare with month offset', () => {
    const ast = parse('search * | stats count | compare 1mo');

    expect(ast.stages).toHaveLength(3);
    expect(ast.stages[2].type).toBe('compare');

    const compare = ast.stages[2] as { type: 'compare'; offset: string };
    expect(compare.offset).toBe('1mo');
  });

  // Timewrap command tests
  it('parses timewrap with span', () => {
    const ast = parse('search * | timechart span=1h count | timewrap 1d');

    expect(ast.stages).toHaveLength(3);
    expect(ast.stages[2].type).toBe('timewrap');

    const timewrap = ast.stages[2] as { type: 'timewrap'; span: string };
    expect(timewrap.span).toBe('1d');
  });

  it('parses timewrap with week span', () => {
    const ast = parse('search * | timechart span=1h count | timewrap 1w');

    expect(ast.stages).toHaveLength(3);
    expect(ast.stages[2].type).toBe('timewrap');

    const timewrap = ast.stages[2] as { type: 'timewrap'; span: string };
    expect(timewrap.span).toBe('1w');
  });
});
