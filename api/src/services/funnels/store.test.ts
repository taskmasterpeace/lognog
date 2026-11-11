import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Real SQLite log store, set up BEFORE the backend is imported.
process.env.LOGNOG_BACKEND = 'sqlite';
process.env.LOGS_DB_PATH = join(tmpdir(), `lognog-funnels-test-${process.env.VITEST_WORKER_ID ?? '0'}-${randomUUID()}.db`);

import { insertLogs } from '../../db/backend';
import { fetchFunnelEvents, rowToFunnelEvent } from './store';
import { buildFunnelReport } from './compute';
import { findFunnelProduct, normalizeFunnelEvent } from './model';

const DAY = 86_400_000;
const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString().replace('Z', '');

function row(index: string, msAgo: number, data: Record<string, unknown>) {
  const event = normalizeFunnelEvent(data, index);
  return {
    timestamp: iso(msAgo),
    hostname: 'test',
    app_name: index,
    message: String(event.message ?? 'x'),
    index_name: index,
    structured_data: JSON.stringify(event),
  };
}

describe('funnel store (real SQLite): from stored log lines to a report', () => {
  beforeAll(async () => {
    await insertLogs([
      row('directors-palette', 5 * DAY, { funnel_stage: 'visit', anon_id: 'a1', utm_source: 'youtube' }),
      row('directors-palette', 5 * DAY - 1000, { funnel_stage: 'signup', anon_id: 'a1', user_id: 'u1' }),
      // old-style lines the product sends today, read through the bridge rules
      row('directors-palette', 4 * DAY, { message: 'Generation completed', event: 'generation_completed', user_id: 'u1' }),
      row('directors-palette', 3 * DAY, { message: 'payment_completed', user_id: 'u1', amount_cents: 999, stripe_session_id: 'cs_1', package_name: 'Starter' }),
      // noise that must not count
      row('directors-palette', 3 * DAY, { message: 'GET /api/x 200', user_id: 'u1' }),
      row('directors-palette', 3 * DAY, { funnel_stage: 'not_a_stage', user_id: 'u1' }),
      // another product, another index
      row('hey-youre-hired', 2 * DAY, { funnel_stage: 'signup', user_id: 'h1' }),
      // too old for the request below
      row('directors-palette', 200 * DAY, { funnel_stage: 'signup', user_id: 'ancient' }),
    ]);
  });

  it('returns only real funnel events, for that product, since the given time', async () => {
    const dp = findFunnelProduct('directors-palette')!;
    const { events, truncated } = await fetchFunnelEvents(dp, now - 120 * DAY, null);
    expect(truncated).toBe(false);
    expect(events.map((e) => e.stage)).toEqual(['visit', 'signup', 'use', 'paid']);
    expect(events[3]).toMatchObject({ event: 'points_purchased', amountCents: 999, plan: 'Starter', eventId: 'cs_1', userId: 'u1' });
  });

  it('gives a key nothing for a product whose index it may not read', async () => {
    const dp = findFunnelProduct('directors-palette')!;
    expect((await fetchFunnelEvents(dp, now - 120 * DAY, ['hey-youre-hired'])).events).toEqual([]);
    expect((await fetchFunnelEvents(dp, now - 120 * DAY, ['directors-palette'])).events).toHaveLength(4);
  });

  it('feeds the report end to end', async () => {
    const dp = findFunnelProduct('directors-palette')!;
    const { events } = await fetchFunnelEvents(dp, now - 120 * DAY, null);
    const r = buildFunnelReport(dp, events, { from: now - 30 * DAY, to: now, now });
    expect(r.getIn.find((x) => x.stage === 'visit')?.people).toBe(1);
    expect(r.pay.find((x) => x.stage === 'paid')?.people).toBe(1);
    expect(r.movingToPaid.revenueCents).toBe(999);
    expect(r.bySource[0]).toMatchObject({ source: 'youtube', signedUp: 1 });
    // Directors Palette has no subscription, so "cancelled" is not something it can fail to report.
    expect(r.notReported).not.toContain('churn');
  });

  it('reads stored timestamps as UTC and skips rows it cannot parse', () => {
    expect(rowToFunnelEvent({ timestamp: '2026-11-01 10:00:00.000', structured_data: '{"funnel_stage":"visit","anon_id":"a"}' })?.ts).toBe(Date.UTC(2026, 10, 1, 10));
    expect(rowToFunnelEvent({ timestamp: '2026-11-01T10:00:00.000', structured_data: 'not json' })).toBeNull();
    expect(rowToFunnelEvent({ timestamp: 'garbage', structured_data: '{"funnel_stage":"visit"}' })).toBeNull();
  });
});
