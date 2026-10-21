/**
 * Alert History showed a run at 4:00 AM while "Last Run" said midnight for the
 * same run: history times come from SQLite as "2026-10-07 04:00:01" (UTC, no
 * zone) and the UI read them as local time. ClickHouse log rows have the same
 * shape ("2026-10-07 03:47:12.235"). The UI formatter (ui/src/utils/formatDate.ts)
 * now reads a zone-less date-time as UTC.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';

type Fmt = (d: Date | string | number | null | undefined, f?: string, tz?: string) => string;
interface FormatModule { formatTimestamp: Fmt; formatTimeOnly: Fmt; formatDateOnly: Fmt; toDate(d: Date | string | number): Date }
const UI_MODULE = resolve(__dirname, '../../../ui/src/utils/formatDate.ts');
let m: FormatModule;
beforeAll(async () => { m = (await import(UI_MODULE)) as FormatModule; });

const NY = 'America/New_York';

describe('server timestamps without a zone are UTC', () => {
  it('a history row and Last Run for the same run show the same time', () => {
    // Live 10-07: history triggered_at "2026-10-07 04:00:01", alert last_triggered "2026-10-07T04:00:01.217Z"
    const history = m.formatTimestamp('2026-10-07 04:00:01', '12-hour', NY);
    const lastRun = m.formatTimestamp('2026-10-07T04:00:01.217Z', '12-hour', NY);
    expect(history).toBe(lastRun);
    expect(history).toBe('Oct 7, 2026, 12:00 AM');
  });

  it('reads ClickHouse/SQLite log times (space or T, with or without ms) as UTC', () => {
    expect(m.toDate('2026-10-07 03:47:12.235').toISOString()).toBe('2026-10-07T03:47:12.235Z');
    expect(m.toDate('2026-10-21T07:43:18.783').toISOString()).toBe('2026-10-21T07:43:18.783Z');
    expect(m.toDate('2026-10-21 08:19').toISOString()).toBe('2026-10-21T08:19:00.000Z');
    expect(m.formatTimeOnly('2026-10-21 08:19:54', '24-hour', NY)).toBe('04:19:54');
  });

  it('leaves times that carry a zone, numbers, Dates and date-only strings alone', () => {
    expect(m.toDate('2026-10-21T08:19:54Z').toISOString()).toBe('2026-10-21T08:19:54.000Z');
    expect(m.toDate('2026-10-21T04:19:54-04:00').toISOString()).toBe('2026-10-21T08:19:54.000Z');
    expect(m.toDate(1792568598783).getTime()).toBe(1792568598783);
    const d = new Date(0);
    expect(m.toDate(d)).toBe(d);
    expect(m.formatDateOnly('2026-10-21', 'iso')).toBe('2026-10-21');
    expect(m.formatTimestamp('not a date')).toBe('-');
  });
});
