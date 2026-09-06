import { describe, it, expect } from 'vitest';
import { parseAndCompile, parseToAST, compileDSL } from './index';
import { compileDSLToSQLite } from './compiler-sqlite';

const sqlite = (q: string) => compileDSLToSQLite(parseToAST(q)).sql;

/**
 * Splunk-parity fixes: wildcard `=`, top/rare BY, fillnull, convert,
 * strftime/strptime, chart pivot, inputlookup/outputlookup, append.
 */

describe('wildcard with = (host=web*)', () => {
  it('trailing wildcard on a known column -> LIKE', () => {
    const r = parseAndCompile('search hostname=web*');
    expect(r.sql).toContain("hostname LIKE 'web%'");
  });

  it('leading wildcard -> LIKE', () => {
    const r = parseAndCompile('search hostname=*.internal');
    expect(r.sql).toContain("hostname LIKE '%.internal'");
  });

  it('surrounding wildcards -> LIKE %..%', () => {
    const r = parseAndCompile('search hostname=*web*');
    expect(r.sql).toContain("hostname LIKE '%web%'");
  });

  it('number-prefixed wildcard (status=4*) -> LIKE', () => {
    const r = parseAndCompile('search status_code=4*');
    // status_code is a structured_data field
    expect(r.sql).toContain("LIKE '4%'");
  });

  it('negated wildcard (host!=web*) -> NOT LIKE', () => {
    const r = parseAndCompile('search hostname!=web*');
    expect(r.sql).toMatch(/NOT \(hostname LIKE 'web%'\)/);
  });

  it('wildcard on a structured_data field -> JSONExtractString LIKE', () => {
    const r = parseAndCompile('search model_id=gpt*');
    expect(r.sql).toContain("LIKE 'gpt%'");
  });

  it('does not break a following condition', () => {
    const r = parseAndCompile('search hostname=web* severity<=3');
    expect(r.sql).toContain("hostname LIKE 'web%'");
    expect(r.sql).toContain('severity <= 3');
  });

  it('bare `search *` still means match-all, not LIKE', () => {
    const r = parseAndCompile('search *');
    expect(r.sql).not.toContain('LIKE');
  });

  it('SQLite backend: host=web* -> LIKE', () => {
    expect(sqlite('search hostname=web*')).toContain("hostname LIKE 'web%'");
  });

  it('SQLite backend: negated wildcard -> NOT LIKE', () => {
    expect(sqlite('search hostname!=web*')).toMatch(/NOT \(hostname LIKE 'web%'\)/);
  });

  it('field=* is still an existence check, not LIKE', () => {
    const r = parseAndCompile('search hostname=*');
    expect(r.sql).not.toContain('LIKE');
  });
});

describe('chart command (was a dead no-op)', () => {
  it('chart with count aggregates by the x field', () => {
    const r = parseAndCompile('search * | chart type=bar x=hostname agg=count');
    expect(r.sql).toContain('count()');
    expect(r.sql).toContain('GROUP BY');
    expect(r.sql).toContain('hostname');
  });

  it('chart avg(y) over x aggregates and groups', () => {
    const r = parseAndCompile('search * | chart type=line x=hostname y=bytes agg=avg');
    expect(r.sql).toContain('avg(');
    expect(r.sql).toContain('GROUP BY');
  });

  it('chart with a split-by series groups by x and series', () => {
    const r = parseAndCompile('search * | chart type=bar x=status_code agg=count by=hostname');
    expect(r.sql).toContain('GROUP BY');
    expect(r.sql).toContain('hostname');
  });

  it('surfaces chartType + fields as metadata', () => {
    const r = compileDSL(parseToAST('search * | chart type=pie x=hostname agg=count'));
    expect(r.metadata?.chart?.chartType).toBe('pie');
    expect(r.metadata?.chart?.xField).toBe('hostname');
  });

  it('chart limit=N parses (limit is a keyword token) and caps the query', () => {
    const r = compileDSL(parseToAST('search * | chart type=pie x=severity agg=count limit=5'));
    expect(r.sql).toContain('LIMIT 5');
    expect(r.metadata?.chart?.chartType).toBe('pie');
  });

  it('a bare chart (no agg) counts', () => {
    const r = parseAndCompile('search * | chart type=table x=hostname');
    expect(r.sql).toContain('count()');
    expect(r.sql).toContain('GROUP BY');
  });

  it('SQLite backend: chart aggregates by x', () => {
    const s = sqlite('search * | chart type=bar x=hostname agg=count');
    expect(s).toMatch(/COUNT\(\*\)/i);
    expect(s).toContain('GROUP BY');
  });
});

describe('top / rare BY (per-group)', () => {
  it('top N field by group -> ClickHouse LIMIT N BY group', () => {
    const r = parseAndCompile('search * | top 5 status_code by hostname');
    expect(r.sql).toContain('LIMIT 5 BY hostname');
    expect(r.sql).toContain('hostname');
  });

  it('rare N field by group -> LIMIT N BY, ordered ascending', () => {
    const r = parseAndCompile('search * | rare 3 status_code by hostname');
    expect(r.sql).toContain('LIMIT 3 BY hostname');
    expect(r.sql).toContain('count ASC');
  });

  it('top without by is unchanged (global LIMIT, no BY)', () => {
    const r = parseAndCompile('search * | top 10 hostname');
    expect(r.sql).toContain('LIMIT 10');
    expect(r.sql).not.toContain('LIMIT 10 BY');
  });

  it('SQLite: top N by group -> ROW_NUMBER window subquery', () => {
    const s = sqlite('search * | top 5 status_code by hostname');
    expect(s).toContain('ROW_NUMBER() OVER (PARTITION BY hostname');
    expect(s).toContain('__rn <= 5');
  });

  it('SQLite: rare by orders ascending in the window', () => {
    const s = sqlite('search * | rare 2 status_code by hostname');
    expect(s).toMatch(/ORDER BY COUNT\(\*\) ASC/);
    expect(s).toContain('__rn <= 2');
  });
});

describe('fillnull', () => {
  it('fills a named field with a default of 0', () => {
    const r = parseAndCompile('search * | fillnull model_id');
    expect(r.sql).toContain('COALESCE(');
    expect(r.sql).toContain('AS model_id');
    expect(r.sql).toMatch(/, 0\) AS model_id/);
  });

  it('honors value= with a string', () => {
    const r = parseAndCompile('search * | fillnull value="N/A" model_id');
    expect(r.sql).toContain("'N/A'");
    expect(r.sql).toContain('COALESCE(');
  });

  it('SQLite: fillnull value=0', () => {
    const s = sqlite('search * | fillnull value=0 model_id');
    expect(s).toContain('COALESCE(');
    expect(s).toContain('AS model_id');
  });
});

describe('convert', () => {
  it('num() casts to a number (ClickHouse)', () => {
    const r = parseAndCompile('search * | convert num(bytes)');
    expect(r.sql).toContain('toFloat64OrNull');
    expect(r.sql).toContain('AS bytes');
  });

  it('num() casts to REAL (SQLite)', () => {
    const s = sqlite('search * | convert num(bytes)');
    expect(s).toContain('CAST(');
    expect(s).toContain('AS REAL');
  });

  it('ctime() formats epoch time; alias supported', () => {
    const r = parseAndCompile('search * | convert ctime(created) as created_str');
    expect(r.sql).toContain('formatDateTime');
    expect(r.sql).toContain('AS created_str');
  });
});

describe('strftime / strptime eval functions', () => {
  it('strftime maps to formatDateTime (ClickHouse)', () => {
    const r = parseAndCompile('search * | eval t=strftime(timestamp, "%Y-%m-%d")');
    expect(r.sql).toContain('formatDateTime');
  });

  it('strptime maps to a parse (ClickHouse)', () => {
    const r = parseAndCompile('search * | eval e=strptime(created, "%Y-%m-%d")');
    expect(r.sql).toContain('parseDateTimeBestEffort');
  });

  it('SQLite strftime swaps args (format first)', () => {
    const s = sqlite('search * | eval t=strftime(timestamp, "%Y-%m-%d")');
    expect(s).toMatch(/strftime\('%Y-%m-%d',/);
  });
});

describe('wildcard does not affect eval arithmetic', () => {
  it('eval multiply with no spaces stays multiplication', () => {
    const ast = parseToAST('search * | eval doubled=bytes*2');
    const evalStage = ast.stages.find((s) => s.type === 'eval') as any;
    expect(evalStage.assignments[0].expression.type).toBe('binary');
    expect(evalStage.assignments[0].expression.operator).toBe('*');
  });

  it('eval multiply with spaces stays multiplication', () => {
    const r = parseAndCompile('search * | eval total=a * b');
    expect(r.sql).toContain('*');
    // not a LIKE
    expect(r.sql).not.toContain("LIKE 'a%'");
  });
});
