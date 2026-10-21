/**
 * The source freshness rule (ui/src/utils/sourceStatus.ts) is shared by the
 * Data Sources table and the Home page's app cards. Server times come without a
 * zone ("2026-10-21 13:00:00.000" from ClickHouse, "2026-10-21T13:00:00.000"
 * from lite) and are UTC; reading them as local time made an app silent for
 * two hours show "Active" on an Eastern-time browser.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';

interface Status { label: string; color: string; dotClass: string }
interface StatusModule {
  getStatusInfo(lastSeen: string, now?: Date): Status;
  formatRelativeTime(d: string, now?: Date): string;
}
const UI_MODULE = resolve(__dirname, '../../../ui/src/utils/sourceStatus.ts');
let m: StatusModule;
const savedTZ = process.env.TZ;
beforeAll(async () => {
  process.env.TZ = 'America/New_York';
  m = (await import(UI_MODULE)) as StatusModule;
});
afterAll(() => {
  if (savedTZ === undefined) delete process.env.TZ; else process.env.TZ = savedTZ;
});

const NOW = new Date('2026-10-21T15:00:00.000Z');

describe('source freshness in words and colour', () => {
  it('reads zone-less server times as UTC (ClickHouse and lite shapes)', () => {
    expect(m.getStatusInfo('2026-10-21 13:00:00.000', NOW).label).toBe('Inactive');
    expect(m.getStatusInfo('2026-10-21T13:00:00.000', NOW).label).toBe('Inactive');
    expect(m.formatRelativeTime('2026-10-21 13:00:00.000', NOW)).toBe('2h ago');
  });

  it('keeps the Data Sources thresholds: 15 min, 1 h, 1 day', () => {
    expect(m.getStatusInfo('2026-10-21T14:50:00Z', NOW)).toEqual({ color: 'text-green-500', label: 'Active', dotClass: 'bg-green-500' });
    expect(m.getStatusInfo('2026-10-21T14:30:00Z', NOW).label).toBe('Recent');
    expect(m.getStatusInfo('2026-10-21T10:00:00Z', NOW).label).toBe('Inactive');
    expect(m.getStatusInfo('2026-10-19T10:00:00Z', NOW)).toEqual({ color: 'text-nog-400', label: 'Stale', dotClass: 'bg-nog-400' });
  });
});
