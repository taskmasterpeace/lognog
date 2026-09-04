import { describe, it, expect } from 'vitest';
import { parseAndCompile, parseToAST } from './index';

/**
 * Regression tests for the four DSL bugs that broke 27 of 105 real production
 * dashboard panels (Api Service / WebApp). See the 2026-07-03 pass.
 */
describe('Dashboard panel DSL fixes', () => {
  it('timechart works WITHOUT an explicit span (Bug C)', () => {
    // `timechart count by level` previously threw ParseError: Expected "span".
    expect(() => parseToAST('search index=api-service | timechart count by level')).not.toThrow();
    const r = parseAndCompile('search * | timechart count by level');
    expect(r.sql).toContain('count()');
  });

  it('sort by an aggregation alias references the column, not structured_data (Bug A)', () => {
    // `stats count by X | sort -count` was compiling ORDER BY
    // JSONExtractString(structured_data, 'count') and erroring in ClickHouse.
    const r = parseAndCompile('search index=api-service | stats count by model_id | sort desc count | limit 10');
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

  it('sort by a structured_data group-by field reuses the JSONExtract expression, not a bare identifier', () => {
    // Regression from the outputAliases fix: `stats count by user_id | sort -user_id`
    // must ORDER BY the same JSONExtract as the GROUP BY, not a nonexistent `user_id`.
    const r = parseAndCompile('search * | stats count by user_id | sort -user_id');
    expect(r.sql).toContain("ORDER BY JSONExtractString(structured_data, 'user_id') DESC");
    expect(r.sql).not.toMatch(/ORDER BY user_id\b/);
  });

  it('sort by a known group-by column still works', () => {
    const r = parseAndCompile('search * | stats count by hostname | sort hostname');
    expect(r.sql).toContain('ORDER BY hostname');
  });

  it('timechart split-by sort reuses the JSONExtract expression', () => {
    const r = parseAndCompile('search * | timechart count by response_code | sort -response_code');
    expect(r.sql).toContain("ORDER BY JSONExtractString(structured_data, 'response_code') DESC");
  });

  it('a rex-extracted field used as a stats by-key groups by the extraction, not structured_data', () => {
    const r = parseAndCompile('search * | rex field=message "(?<status>\\\\d{3})" | stats count by status | sort status');
    // Group-by + order-by must use the rex extraction expression, not JSONExtract.
    expect(r.sql).toContain('extractGroups(message');
    expect(r.sql).not.toContain("JSONExtractString(structured_data, 'status')");
    expect(r.sql).toContain('GROUP BY');
  });

  it('a numeric aggregation over a rex-extracted field coerces it to a number', () => {
    const r = parseAndCompile('search * | rex field=message "\\\\((?<latency>\\\\d+)ms\\\\)" | stats avg(latency) as avg_latency by endpoint');
    expect(r.sql).toContain('toFloat64OrZero(extractGroups(message');
    expect(r.sql).toContain('AS avg_latency');
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
