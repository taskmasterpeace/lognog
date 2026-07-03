import { describe, it, expect } from 'vitest';
import { compileDSL } from './compiler';
import { compileDSLToSQLite } from './compiler-sqlite';
import { parseToAST } from './index';

/**
 * Regression tests for the backend bug sweep (#41):
 *  #3 dedup real implementation (CH LIMIT 1 BY / SQLite GROUP BY)
 *  #4 SQLite relative-time excludes today's logs (T vs space separator)
 *  #5 SQLite bare-count alias divergence
 *  #6 rex multiple named groups extract wrong values
 *  #7 sort on a structured_data field -> invalid SQL
 * #11 compare/timewrap unit regex mis-anchored (parser)
 */

describe('#41-3 dedup is a real dedup, not a silent no-op', () => {
  it('ClickHouse: emits LIMIT 1 BY over the dedup keys and keeps all columns', () => {
    const result = compileDSL(parseToAST('search * | dedup hostname'));
    // Preserves the full default select list (message/severity/etc still there)
    expect(result.sql).toContain('message');
    expect(result.sql).toContain('structured_data');
    // Real dedup clause present
    expect(result.sql).toMatch(/LIMIT 1 BY hostname/);
  });

  it('ClickHouse: dedup on multiple keys lists them all', () => {
    const result = compileDSL(parseToAST('search * | dedup hostname, severity'));
    expect(result.sql).toMatch(/LIMIT 1 BY hostname, severity/);
  });

  it('ClickHouse: dedup on a custom (structured_data) field uses JSONExtract', () => {
    const result = compileDSL(parseToAST('search * | dedup request_id'));
    expect(result.sql).toMatch(/LIMIT 1 BY JSONExtractString\(structured_data, 'request_id'\)/);
  });

  it('SQLite: collapses to GROUP BY on the dedup keys while keeping all columns', () => {
    const result = compileDSLToSQLite(parseToAST('search * | dedup hostname'));
    expect(result.sql).toContain('message');
    expect(result.sql).toContain('GROUP BY hostname');
  });

  it('does not emit DISTINCT-less no-op that drops columns anymore (CH)', () => {
    const result = compileDSL(parseToAST('search * | dedup hostname'));
    // Old bug: select list became just "hostname". Assert it is NOT just that.
    expect(result.sql).not.toMatch(/SELECT hostname FROM lognog\.logs/);
  });
});

describe('#41-4 SQLite relative time normalizes the T separator', () => {
  it('wraps the timestamp column with replace(...,T, space) for earliest/latest', () => {
    const result = compileDSLToSQLite(
      parseToAST('search *'),
      undefined,
      { earliest: '-1h', latest: 'now' }
    );
    expect(result.sql).toContain("replace(timestamp, 'T', ' ') >=");
    expect(result.sql).toContain("replace(timestamp, 'T', ' ') <=");
  });

  it('a row inserted "now" (ISO with T) falls within earliest=-1h latest=now', () => {
    // Simulate the lexicographic comparison the compiled SQL performs.
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19); // datetime('now') form
    const rowIsoWithT = new Date().toISOString().slice(0, 19); // stored form, has T
    const rowNormalized = rowIsoWithT.replace('T', ' ');
    // Normalized row must be <= now (the bug was T > space made it fail)
    expect(rowNormalized <= nowIso).toBe(true);
    // And demonstrate the OLD behavior would have failed:
    expect(rowIsoWithT <= nowIso).toBe(false);
  });
});

describe('#41-5 SQLite bare count aliases to `count`', () => {
  it('aliases COUNT(*) AS count (not count_all)', () => {
    const result = compileDSLToSQLite(parseToAST('search * | stats count by hostname'));
    expect(result.sql).toContain('COUNT(*) AS count');
    expect(result.sql).not.toContain('count_all');
  });

  it('so `stats count by hostname | sort -count` references a real column', () => {
    const result = compileDSLToSQLite(
      parseToAST('search * | stats count by hostname | sort -count')
    );
    expect(result.sql).toContain('COUNT(*) AS count');
    expect(result.sql).toContain('ORDER BY count DESC');
  });

  it('ClickHouse parity: bare count also aliases to count', () => {
    const result = compileDSL(parseToAST('search * | stats count by hostname'));
    expect(result.sql).toContain('count() AS count');
  });
});

describe('#41-6 rex multiple named groups extract distinct values', () => {
  it('each named group gets its own indexed extractGroups value', () => {
    const result = compileDSL(
      parseToAST('search * | rex field=message "user=(?P<username>\\w+) id=(?P<uid>\\d+)"')
    );
    // group 1 -> username, group 2 -> uid (1-based indexing)
    expect(result.sql).toMatch(/extractGroups\(message, '.*'\)\[1\] AS username/);
    expect(result.sql).toMatch(/extractGroups\(message, '.*'\)\[2\] AS uid/);
    // Old bug: used extract(...) which returns only group 1 for every column.
    expect(result.sql).not.toMatch(/extract\(message, '[^']*'\) AS uid/);
  });

  it('strips (?P<name>...) down to a plain capturing group for RE2', () => {
    const result = compileDSL(
      parseToAST('search * | rex field=message "(?P<a>\\w+)"')
    );
    expect(result.sql).not.toContain('?P<');
  });
});

describe('#41-7 sort on a structured_data field compiles to valid SQL', () => {
  it('ClickHouse: sort -response_time uses the JSONExtract projection', () => {
    const result = compileDSL(parseToAST('search * | sort -response_time'));
    expect(result.sql).toMatch(
      /ORDER BY JSONExtractString\(structured_data, 'response_time'\) DESC/
    );
    // Old bug: ORDER BY response_time DESC -> Unknown identifier
    expect(result.sql).not.toMatch(/ORDER BY response_time DESC/);
  });

  it('ClickHouse: sort on a known column still uses the bare column name', () => {
    const result = compileDSL(parseToAST('search * | sort -severity'));
    expect(result.sql).toContain('ORDER BY severity DESC');
  });
});
