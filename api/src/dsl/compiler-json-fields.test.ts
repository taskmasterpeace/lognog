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
      'search index=directors-palette | stats sum(credits_cost) as credits, avg(duration_ms) by model_id'
    ));
    expect(result.sql).toContain(`sum(${NUM('credits_cost')}) AS credits`);
    expect(result.sql).toContain(`avg(${NUM('duration_ms')}) AS avg_duration_ms`);
    // Group-by stays a string extraction.
    expect(result.sql).toContain("JSONExtractString(structured_data, 'model_id')");
  });

  it('string equality on a custom field is unchanged', () => {
    const result = compileDSL(parseToAST('search model_id="google/nano-banana-2"'));
    expect(result.sql).toContain("JSONExtractString(structured_data, 'model_id') = 'google/nano-banana-2'");
  });
});
