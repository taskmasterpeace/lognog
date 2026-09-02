import { describe, it, expect } from 'vitest';
import { parseToAST } from './index.js';
import { compileDSLToSQLite } from './compiler-sqlite.js';

// Group-by on custom (structured_data) fields in Lite mode: results should
// carry the field name, matching the ClickHouse compiler, and top/rare must
// extract the field instead of naming a column that doesn't exist.
describe('SQLite group-by projection', () => {
  it('stats by a custom field aliases the extraction to the field name', () => {
    const { sql } = compileDSLToSQLite(parseToAST('search * | stats count by model_id'));
    expect(sql).toContain("SELECT json_extract(structured_data, '$.model_id') AS model_id, COUNT(*) AS count");
    expect(sql).toContain("GROUP BY json_extract(structured_data, '$.model_id')");
  });

  it('stats by a known column is unchanged', () => {
    const { sql } = compileDSLToSQLite(parseToAST('search * | stats count by hostname'));
    expect(sql).toContain('SELECT hostname, COUNT(*) AS count');
  });

  it('top/rare on a custom field extract it (was a bare "no such column" name)', () => {
    const top = compileDSLToSQLite(parseToAST('search * | top user_id')).sql;
    expect(top).toContain("json_extract(structured_data, '$.user_id') AS user_id, COUNT(*) AS count");
    expect(top).toContain("GROUP BY json_extract(structured_data, '$.user_id') ORDER BY count DESC LIMIT 10");
    const rare = compileDSLToSQLite(parseToAST('search * | rare 3 user_id')).sql;
    expect(rare).toContain('ORDER BY count ASC LIMIT 3');
    expect(rare).not.toMatch(/GROUP BY user_id\b/);
  });

  it('timechart split-by on a custom field is aliased in SELECT only', () => {
    const { sql } = compileDSLToSQLite(parseToAST('search * | timechart span=1h count by model_id'));
    expect(sql).toMatch(/AS time_bucket, json_extract\(structured_data, '\$\.model_id'\) AS model_id, COUNT\(\*\)/);
    const groupBy = sql.slice(sql.indexOf('GROUP BY'));
    expect(groupBy).not.toContain('AS model_id');
  });

  it('a field that is not a bare identifier gets a double-quoted alias', () => {
    const { sql } = compileDSLToSQLite(parseToAST('search * | stats count by demo-seed'));
    expect(sql).toContain('AS "demo-seed"');
  });
});
