import { describe, it, expect } from 'vitest';
import { parseAndCompile, parseToAST } from './index';
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
