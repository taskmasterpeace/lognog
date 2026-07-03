import { describe, it, expect } from 'vitest';
import { parseAndCompile, parseToAST } from './index';

/**
 * Regression tests for the four DSL bugs that broke 27 of 105 real production
 * dashboard panels (Directors Palette / HeyYoureHired). See the 2026-07-03 pass.
 */
describe('Dashboard panel DSL fixes', () => {
  it('timechart works WITHOUT an explicit span (Bug C)', () => {
    // `timechart count by level` previously threw ParseError: Expected "span".
    expect(() => parseToAST('search index=directors-palette | timechart count by level')).not.toThrow();
    const r = parseAndCompile('search * | timechart count by level');
    expect(r.sql).toContain('count()');
  });

  it('sort by an aggregation alias references the column, not structured_data (Bug A)', () => {
    // `stats count by X | sort -count` was compiling ORDER BY
    // JSONExtractString(structured_data, 'count') and erroring in ClickHouse.
    const r = parseAndCompile('search index=directors-palette | stats count by model_id | sort desc count | limit 10');
    expect(r.sql).toContain('count() AS count');
    expect(r.sql).toContain('ORDER BY count DESC');
    expect(r.sql).not.toContain("structured_data, 'count'");
  });

  it('sort by a named aggregation alias resolves (avg_latency)', () => {
    const r = parseAndCompile('search * | stats avg(latency) as avg_latency by endpoint | sort -avg_latency');
    expect(r.sql).toContain('ORDER BY avg_latency DESC');
    expect(r.sql).not.toContain("structured_data, 'avg_latency'");
  });

  it('parses and resolves sort by an aggregation-function expression (Bug B)', () => {
    // `sort desc sum(credits_cost)` previously threw "Unexpected token '('".
    expect(() => parseToAST('search * | stats sum(credits_cost) by model_id | sort desc sum(credits_cost)')).not.toThrow();
    const r = parseAndCompile('search * | stats sum(credits_cost) by model_id | sort desc sum(credits_cost)');
    expect(r.sql).toContain('AS sum_credits_cost');
    expect(r.sql).toContain('ORDER BY sum_credits_cost DESC');
  });

  it('sort on a raw structured_data field still extracts from JSON (Bug #41-7 preserved)', () => {
    const r = parseAndCompile('search * | sort -response_time');
    expect(r.sql).toContain("JSONExtractString(structured_data, 'response_time') DESC");
  });

  it('table with custom fields projects them from structured_data (Bug D)', () => {
    // `table timestamp, user_id, model_id` previously selected bare column names
    // and ClickHouse errored "Missing columns".
    const r = parseAndCompile('search * | table timestamp, level, user_id, model_id | limit 100');
    expect(r.sql).toContain("JSONExtractString(structured_data, 'user_id') AS user_id");
    expect(r.sql).toContain("JSONExtractString(structured_data, 'model_id') AS model_id");
    expect(r.sql).toContain('timestamp');
  });
});
