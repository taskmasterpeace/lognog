/**
 * Report output safety: log content reaches emails and spreadsheets, so
 * template substitution must HTML-escape by default and CSV cells must not
 * be executable formulas.
 */
import { describe, it, expect } from 'vitest';
import { processTemplate, type ReportContext } from './template-engine.js';
import { renderCsv, type ReportData } from './report-renderer.js';

function ctx(results: Record<string, unknown>[]): ReportContext {
  return {
    report_name: 'Safety <test>',
    report_id: 'r1',
    run_time: '2026-09-02T00:00:00.000Z',
    execution_time_ms: 1,
    time_range: 'Last 24 hours',
    earliest: '2026-09-01T00:00:00.000Z',
    latest: '2026-09-02T00:00:00.000Z',
    results,
    result: results[0],
    result_count: results.length,
    column_count: results[0] ? Object.keys(results[0]).length : 0,
    columns: results[0] ? Object.keys(results[0]) : [],
    app_name: 'LogNog',
    app_scope: 'default',
  } as ReportContext;
}

describe('template HTML escaping', () => {
  const results = [{ message: '<img src=x onerror=alert(1)>', hostname: 'web-01' }];

  const html = { escapeHtml: true };

  it('escapes substituted values when rendering HTML', () => {
    const out = processTemplate('<p>{{result.message}}</p>', ctx(results), html);
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes inside loops too', () => {
    const out = processTemplate('{{#each results}}<li>{{message}}</li>{{/each}}', ctx(results), html);
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('offers :raw to opt out deliberately', () => {
    const out = processTemplate('{{result.message:raw}}', ctx(results), html);
    expect(out).toContain('<img src=x onerror=alert(1)>');
  });

  it('does not double-escape an explicit escape_html', () => {
    const out = processTemplate('{{result.message:escape_html}}', ctx(results), html);
    expect(out).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes the report name, leaves numbers alone', () => {
    const out = processTemplate('{{report_name}} / {{result_count}}', ctx(results), html);
    expect(out).toBe('Safety &lt;test&gt; / 1');
  });

  it('is off for plain-text channels (Apprise, subjects)', () => {
    const out = processTemplate('{{result.message}}', ctx(results));
    expect(out).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('CSV formula injection guard', () => {
  const data: ReportData = {
    report: { id: 'r1', name: 'csv', query: 'search *' },
    results: [
      { message: '=HYPERLINK("http://evil","click")', note: '+1', ip: '-1.2.3.4', tag: '@cmd', ok: 'plain, text' },
    ],
    executionTimeMs: 1,
    earliest: '2026-09-01T00:00:00.000Z',
    latest: '2026-09-02T00:00:00.000Z',
  };

  it('neutralises cells starting with = + - @ and quotes them', () => {
    const csv = renderCsv(data);
    const [, row] = csv.replace(/^﻿/, '').split('\n');
    expect(row).toContain('"\'=HYPERLINK(""http://evil"",""click"")"');
    expect(row).toContain("\"'+1\"");
    expect(row).toContain("\"'-1.2.3.4\"");
    expect(row).toContain("\"'@cmd\"");
    expect(row).toContain('"plain, text"');
  });

  it('starts with a UTF-8 BOM so spreadsheets decode it correctly', () => {
    expect(renderCsv(data).charCodeAt(0)).toBe(0xfeff);
  });
});
