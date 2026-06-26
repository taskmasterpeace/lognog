/**
 * Regression tests for DSL compiler correctness + injection fixes.
 * Covers issue #41 (correctness) and the compiler/backend parts of #37 (injection).
 */
import { describe, it, expect } from 'vitest';
import { Compiler } from './compiler';
import { SQLiteCompiler } from './compiler-sqlite';
import { parseToAST } from './index';

function ch(query: string, allowed?: string[], timeBounds?: { earliest?: string; latest?: string }) {
  return new Compiler(parseToAST(query), allowed, timeBounds).compile();
}
function lite(query: string, allowed?: string[], timeBounds?: { earliest?: string; latest?: string }) {
  return new SQLiteCompiler(parseToAST(query), allowed, timeBounds).compile();
}

describe('#41-1 case() keeps every WHEN/THEN branch', () => {
  it('ClickHouse: odd-count case keeps both value branches (no default)', () => {
    // case(status,200,"ok",500,"err") previously dropped the 500 branch.
    const sql = ch('search * | eval label = case(status, 200, "ok", 500, "err")').sql;
    expect(sql).toContain("status = 200, 'ok'");
    expect(sql).toContain("status = 500, 'err'");
    // No trailing else value -> NULL default
    expect(sql).toContain("status = 500, 'err', NULL)");
  });

  it('ClickHouse: case with trailing default keeps all branches + default', () => {
    const sql = ch('search * | eval lvl = case(severity, 0, "emerg", 1, "alert", "other")').sql;
    expect(sql).toContain("multiIf(severity = 0, 'emerg', severity = 1, 'alert', 'other')");
  });

  it('SQLite: odd-count case keeps both value branches', () => {
    const sql = lite('search * | eval label = case(status, 200, "ok", 500, "err")').sql;
    expect(sql).toContain('WHEN status = 200 THEN \'ok\'');
    expect(sql).toContain('WHEN status = 500 THEN \'err\'');
    expect(sql).toContain('ELSE NULL END');
  });
});

describe('#41-2 SQLite severity name -> number', () => {
  it('= severity error compiles to numeric 3', () => {
    const sql = lite('search severity=error').sql;
    expect(sql).toContain('severity = 3');
    expect(sql).not.toContain("severity = 'error'");
  });

  it('!= severity warning compiles to numeric 4', () => {
    const sql = lite('search severity!=warning').sql;
    expect(sql).toContain('severity != 4');
    expect(sql).not.toContain("severity != 'warning'");
  });

  it('level alias also maps via severity', () => {
    const sql = lite('search level=critical').sql;
    expect(sql).toContain('severity = 2');
  });
});

describe('#41-3 SQLite stats/timechart group by custom field', () => {
  it('stats count by user_email extracts from structured_data', () => {
    const sql = lite('search * | stats count by user_email').sql;
    expect(sql).toContain("json_extract(structured_data, '$.user_email')");
    expect(sql).toContain('GROUP BY');
  });

  it('timechart split-by custom field extracts from structured_data', () => {
    const sql = lite('search * | timechart span=1h count by user_email').sql;
    expect(sql).toContain("json_extract(structured_data, '$.user_email')");
  });

  it('avg over a custom field extracts from structured_data', () => {
    const sql = lite('search * | stats avg(response_time)').sql;
    expect(sql).toContain("AVG(json_extract(structured_data, '$.response_time'))");
  });
});

describe('#41-4 != missing structured_data field parity (COALESCE)', () => {
  it('SQLite wraps json_extract in COALESCE(...,\'\') so absent rows match', () => {
    const sql = lite('search user_email!=foo').sql;
    expect(sql).toContain("COALESCE(json_extract(structured_data, '$.user_email'), '') != 'foo'");
  });

  it('SQLite = on custom field is a bare json_extract (no COALESCE needed)', () => {
    const sql = lite('search user_email=foo').sql;
    expect(sql).toContain("json_extract(structured_data, '$.user_email') = 'foo'");
  });
});

describe('#41-5 rename resolves structured_data + aliased fields', () => {
  it('ClickHouse: rename a custom field projects a JSONExtract under the new name', () => {
    const sql = ch('search * | rename user_email as email').sql;
    expect(sql).toContain("JSONExtractString(structured_data, 'user_email') AS email");
  });

  it('ClickHouse: rename a known column re-aliases it', () => {
    const sql = ch('search * | rename hostname as host').sql;
    expect(sql).toContain('hostname AS host');
  });

  it('SQLite: rename a custom field projects a json_extract under the new name', () => {
    const sql = lite('search * | rename user_email as email').sql;
    expect(sql).toContain("json_extract(structured_data, '$.user_email') AS email");
  });
});

describe('#41-6 bin only time-buckets the timestamp column', () => {
  it('ClickHouse: bin response_time numeric-bins (no time bucketing)', () => {
    const sql = ch('search * | bin span=100 response_time').sql;
    expect(sql).toContain('floor(response_time / 100)');
    expect(sql).not.toContain('toStartOf');
  });

  it('SQLite: bin response_time numeric-bins via json_extract (no strftime)', () => {
    const sql = lite('search * | bin span=100 response_time').sql;
    expect(sql).toContain("json_extract(structured_data, '$.response_time')");
    expect(sql).not.toContain('strftime');
  });

  it('ClickHouse: bin timestamp still time-buckets', () => {
    const sql = ch('search * | bin span=1h timestamp').sql;
    expect(sql).toContain('toStartOfHour(timestamp)');
  });
});

describe('#41-7 SQLite stddev/variance compute real values', () => {
  it('stddev is a real aggregate, not literal 0', () => {
    const sql = lite('search * | stats stddev(severity)').sql;
    expect(sql).not.toContain('0 AS');
    expect(sql).toContain('AVG(1.0 * severity * severity)');
    expect(sql).toContain('POWER(');
  });

  it('variance is a real aggregate, not literal 0', () => {
    const sql = lite('search * | stats variance(severity)').sql;
    expect(sql).not.toContain('0 AS');
    expect(sql).toContain('AVG(1.0 * severity * severity)');
  });
});

describe('#37-8 string comparison values are quoted + escaped', () => {
  it("ClickHouse: > on a custom field escapes a single quote in the operand", () => {
    const sql = ch("search response_time>\"a' OR '1'='1\"").sql;
    // The quote must be doubled (escaped) and the whole operand quoted; no raw breakout.
    expect(sql).toContain("''");
    expect(sql).not.toContain("> a' OR");
  });

  it('ClickHouse: != on a custom field escapes a single quote', () => {
    const sql = ch("search user_email!=\"x' OR 1=1 --\"").sql;
    expect(sql).toContain("x'' OR 1=1 --");
    expect(sql).not.toContain("!= 'x' OR 1=1");
  });

  it('SQLite: > on a custom field escapes a single quote in the operand', () => {
    const sql = lite("search response_time>\"a' OR '1'='1\"").sql;
    expect(sql).toContain("''");
  });
});

describe('#37-9 IN/NOT IN non-JSON fallback is escaped', () => {
  it('ClickHouse: a non-JSON IN operand is escaped + quoted, not interpolated raw', () => {
    // 'IN' with a single bareword value that is not valid JSON hits the fallback.
    const ast = parseToAST('search *');
    // Build a condition manually via a query the parser accepts: foo IN ["a"] is JSON;
    // to hit the fallback we craft a value with an embedded quote.
    const sql = new Compiler({
      stages: [{
        type: 'search',
        conditions: [{ field: 'status', operator: 'IN', value: "x') OR ('1'='1", negate: false } as any],
      } as any],
    } as any).compile().sql;
    expect(sql).toContain("''"); // escaped
    expect(sql).not.toContain("IN (x') OR");
    void ast;
  });
});

describe('#37/#41-11 time bounds are built into the compiled WHERE', () => {
  it('ClickHouse: relative earliest adds an INTERVAL bound in the top-level WHERE', () => {
    const sql = ch('search host=router', undefined, { earliest: '-1h' }).sql;
    expect(sql).toContain('timestamp >= now() - INTERVAL 1 HOUR');
    expect(sql).toContain("hostname = 'router'");
  });

  it('ClickHouse: earliest defaults latest to now()', () => {
    const sql = ch('search *', undefined, { earliest: '-15m' }).sql;
    expect(sql).toContain('timestamp >= now() - INTERVAL 15 MINUTE');
    expect(sql).toContain('timestamp <= now()');
  });

  it('SQLite: relative earliest adds a datetime() bound', () => {
    const sql = lite('search host=router', undefined, { earliest: '-1h' }).sql;
    expect(sql).toContain("timestamp >= datetime('now', '-1 hours')");
  });

  it('ClickHouse: time bound coexists with index scope and aggregation', () => {
    const sql = ch('search * | stats count by hostname', ['alpha'], { earliest: '-1d' }).sql;
    expect(sql).toContain('timestamp >= now() - INTERVAL 1 DAY');
    expect(sql).toContain("index_name IN ('alpha')");
    expect(sql).toContain('GROUP BY');
  });
});
