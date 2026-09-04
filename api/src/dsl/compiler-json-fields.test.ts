import { describe, it, expect } from 'vitest';
import { compileDSL } from './compiler';
import { parseToAST } from './index';

// structured_data (JSON) fields on ClickHouse. These mirror what the Directors
// Palette dashboards do: existence filters on custom fields and numeric
// aggregations over values the client may ship as numbers or strings.
const NUM = (f: string) =>
  `toFloat64OrNull(if(JSONType(structured_data, '${f}') = 'String', ` +
  `JSONExtractString(structured_data, '${f}'), JSONExtractRaw(structured_data, '${f}')))`;

describe('ClickHouse compiler: structured_data fields', () => {
  it('field=* on a custom field is a real presence check (JSONHas)', () => {
    const result = compileDSL(parseToAST('search model_id=*'));
    expect(result.sql).toContain("JSONHas(structured_data, 'model_id')");
    // The old `IS NOT NULL` matched every row because JSONExtractString is never NULL.
    expect(result.sql).not.toContain('IS NOT NULL');
  });

  it('field=* on a known column keeps the non-empty check', () => {
    const result = compileDSL(parseToAST('search hostname=*'));
    expect(result.sql).toContain("hostname != ''");
    expect(result.sql).not.toContain('JSONHas');
  });

  it('field!=* selects rows where the field is absent', () => {
    expect(compileDSL(parseToAST('search credits_cost!=*')).sql)
      .toContain("NOT JSONHas(structured_data, 'credits_cost')");
    expect(compileDSL(parseToAST('search hostname!=*')).sql).toContain("hostname = ''");
  });

  it('numeric comparison on a custom field parses the raw token', () => {
    const result = compileDSL(parseToAST('search credits_cost>10'));
    expect(result.sql).toContain(`${NUM('credits_cost')} > 10`);
    expect(result.sql).not.toContain('JSONExtractFloat');
  });

  it('sum/avg over custom fields yield NULL (skipped) for rows without the field', () => {
    const result = compileDSL(parseToAST(
      'search index=api-service | stats sum(credits_cost) as credits, avg(duration_ms) by model_id'
    ));
    expect(result.sql).toContain(`sum(${NUM('credits_cost')}) AS credits`);
    expect(result.sql).toContain(`avg(${NUM('duration_ms')}) AS avg_duration_ms`);
    // Group-by stays a string extraction.
    expect(result.sql).toContain("JSONExtractString(structured_data, 'model_id')");
  });

  it('group-by on a custom field comes back under the field name', () => {
    const result = compileDSL(parseToAST('search * | stats count by model_id'));
    expect(result.sql).toContain("SELECT JSONExtractString(structured_data, 'model_id') AS model_id, count() AS count");
    // GROUP BY keeps the expression (the alias is a projection detail).
    expect(result.sql).toContain("GROUP BY JSONExtractString(structured_data, 'model_id')");
  });

  it('group-by on a known column is not aliased', () => {
    const result = compileDSL(parseToAST('search * | stats count by hostname'));
    expect(result.sql).toContain('SELECT hostname, count() AS count');
  });

  it('timechart split-by on a custom field is aliased', () => {
    const result = compileDSL(parseToAST('search * | timechart span=1h count by model_id'));
    expect(result.sql).toMatch(/SELECT toStartOfHour\(timestamp\) AS time_bucket, JSONExtractString\(structured_data, 'model_id'\) AS model_id, count\(\)/);
  });

  it('top/rare on a custom field extract it from structured_data', () => {
    // mapField() left custom fields as bare names -> ClickHouse "Missing columns".
    expect(compileDSL(parseToAST('search * | top user_id')).sql)
      .toContain("SELECT JSONExtractString(structured_data, 'user_id') AS user_id, count() AS count");
    expect(compileDSL(parseToAST('search * | rare user_id')).sql)
      .toContain("GROUP BY JSONExtractString(structured_data, 'user_id') ORDER BY count ASC");
  });

  it('top/rare accept count forms: none (10), N, limit=N', () => {
    expect(parseToAST('search * | top model_id').stages[1]).toMatchObject({ type: 'top', field: 'model_id', limit: 10 });
    expect(parseToAST('search * | top 5 model_id').stages[1]).toMatchObject({ type: 'top', limit: 5 });
    expect(parseToAST('search * | top limit=3 model_id').stages[1]).toMatchObject({ type: 'top', limit: 3 });
    expect(parseToAST('search * | rare user_id').stages[1]).toMatchObject({ type: 'rare', field: 'user_id', limit: 10 });
    expect(compileDSL(parseToAST('search * | top limit=3 model_id')).sql).toContain('ORDER BY count DESC LIMIT 3');
  });

  it('a group-by field that is not a bare identifier gets a quoted alias', () => {
    const result = compileDSL(parseToAST('search * | stats count by demo-seed'));
    expect(result.sql).toContain("JSONExtractString(structured_data, 'demo-seed') AS `demo-seed`");
  });

  it('string equality on a custom field is unchanged', () => {
    const result = compileDSL(parseToAST('search model_id="google/nano-banana-2"'));
    expect(result.sql).toContain("JSONExtractString(structured_data, 'model_id') = 'google/nano-banana-2'");
  });
});
