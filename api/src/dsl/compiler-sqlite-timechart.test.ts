import { describe, it, expect } from 'vitest';
import { parseToAST } from './index.js';
import { compileDSLToSQLite } from './compiler-sqlite.js';

/**
 * `timechart` on the SQLite (Lite) backend produced
 *   GROUP BY strftime(...) AS time_bucket ORDER BY strftime(...) AS time_bucket
 * which SQLite rejects ("near AS: syntax error"), so every time-series panel
 * and alert in Lite mode failed with a 500.
 */
describe('SQLite timechart compilation', () => {
  it('does not put column aliases into GROUP BY / ORDER BY', () => {
    const { sql } = compileDSLToSQLite(parseToAST('search * | timechart span=1h count'), undefined, { earliest: '-24h', latest: 'now' });
    const groupBy = sql.slice(sql.indexOf('GROUP BY'));
    expect(groupBy).not.toMatch(/\bAS\s+time_bucket/i);
    expect(sql).toMatch(/SELECT .*AS time_bucket/i);
  });

  it('still buckets by minute spans and supports a split-by field', () => {
    const { sql } = compileDSLToSQLite(parseToAST('search * | timechart span=5m count by hostname'), undefined, { earliest: '-1h', latest: 'now' });
    expect(sql).toMatch(/GROUP BY/i);
    expect(sql.slice(sql.indexOf('GROUP BY'))).not.toMatch(/\bAS\s+time_bucket/i);
    expect(sql).toContain('hostname');
  });
});
