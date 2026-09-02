import { describe, it, expect } from 'vitest';
import { buildReportContext, renderHtml, ReportData } from './report-renderer.js';

function data(overrides: Partial<ReportData['report']> = {}): ReportData {
  return {
    report: { id: 'r1', name: 'Errors by host', query: 'search severity<=3 | stats count by hostname', ...overrides },
    results: [{ hostname: 'web-01', count: 12 }, { hostname: 'web-02', count: 3 }],
    executionTimeMs: 42,
    earliest: '2026-09-01T00:00:00.000Z',
    latest: '2026-09-02T00:00:00.000Z',
  };
}

describe('report schedule description', () => {
  it('describes "every N hours" cron instead of "Daily at NaN:00"', () => {
    expect(buildReportContext(data({ schedule: '0 */6 * * *' })).report_schedule).toBe('Every 6 hours');
    expect(buildReportContext(data({ schedule: '0 */1 * * *' })).report_schedule).toBe('Hourly');
  });

  it('still describes a daily schedule', () => {
    expect(buildReportContext(data({ schedule: '30 8 * * *' })).report_schedule).toBe('Daily at 8:30');
  });
});

describe('renderHtml', () => {
  it('uses the LogNog brand accent, not the legacy sky-blue template', () => {
    const html = renderHtml(data());
    expect(html).toContain('#5A3F24');
    expect(html).not.toContain('#0ea5e9');
    expect(html).not.toContain('Spunk');
    expect(html).toContain('web-01');
  });
});
