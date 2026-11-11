/**
 * Cases found in review of the first version. Each one failed before the fix.
 */
import { describe, it, expect } from 'vitest';
import { normalizeFunnelEvent, findFunnelProduct } from './model';
import { buildFunnelReport, FunnelEvent } from './compute';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 1);
const NOW = T0 + 40 * DAY;
const demo = { ...findFunnelProduct('hey-youre-hired')!, activation: 'first_use' as const, quietDays: 14 };
const at = (ms: number, stage: FunnelEvent['stage'], userId: string, extra: Partial<FunnelEvent> = {}): FunnelEvent => ({ ts: ms, stage, event: stage, userId, ...extra });
const report = (events: FunnelEvent[], from = T0) => buildFunnelReport(demo, events, { from, to: NOW, now: NOW });

describe('kids product: nothing gets past the allowlist', () => {
  const leaks = (out: Record<string, unknown>) => JSON.stringify(out);

  it('an unknown stage name is still cleaned, and its text is not echoed', () => {
    const out = normalizeFunnelEvent(
      {
        funnel_stage: 'Timmy Smith finished',
        message: 'Timmy Smith age 7 answered 12',
        props: { child_name: 'Timmy', essay: 'my summer holiday was long' },
        plan: { child: 'x' },
        user_id: 'timmy@example.com',
        worksheet: 'text',
      },
      'homework-tree',
    );
    expect(leaks(out)).not.toMatch(/Timmy|essay|summer|example\.com|worksheet/i);
    expect(out.funnel_stage).toBeUndefined();
    expect(out.funnel_error).toBe('unknown stage');
    expect(out.plan).toBeUndefined();
  });

  it('claiming to be another product does not switch the allowlist off', () => {
    const out = normalizeFunnelEvent(
      { funnel_stage: 'use', product: 'directors-palette', child_answer: 'Timmy wrote 7', props: { answer: 'my name is Timmy Smith' }, user_id: 'p1' },
      'knowledge-league',
    );
    expect(leaks(out)).not.toMatch(/Timmy/);
    expect(out.product).toBe('homework-tree');
  });

  it('naming the kids product from another index turns the allowlist on', () => {
    const out = normalizeFunnelEvent({ funnel_stage: 'use', product: 'homework-tree', child_name: 'Timmy', user_id: 'p1' }, 'some-other-index');
    expect(leaks(out)).not.toMatch(/Timmy/);
  });

  it('allowlisted fields must hold a short code, a number or a time, never text or objects', () => {
    const out = normalizeFunnelEvent(
      {
        funnel_stage: 'use',
        user_id: 'p1',
        timestamp: { child_name: 'Timmy' },
        hostname: "Timmy Smith's iPad",
        app_name: 'free text here',
        level: { kid: ['a'] },
        product: 'Timmy Smith age 7',
        plan: { child: 'x' },
        amount_cents: { child: 'x' },
        funnel_v: 'Timmy',
        funnel_event: { name: 'Timmy' },
        session_id: { kid: 'Timmy' },
      },
      'homework-tree',
    );
    expect(leaks(out)).not.toMatch(/Timmy|iPad|free text|kid/);
    expect(out).toMatchObject({ funnel_stage: 'use', funnel_event: 'use', funnel_v: 1, product: 'homework-tree', user_id: 'p1' });
  });

  it('keeps a good timestamp', () => {
    const out = normalizeFunnelEvent({ funnel_stage: 'use', user_id: 'p1', timestamp: '2026-11-11T10:00:00.000Z' }, 'homework-tree');
    expect(out.timestamp).toBe('2026-11-11T10:00:00.000Z');
  });
});

describe('lines outside the declared products are never touched', () => {
  it('an unrelated app that happens to use a field called funnel_stage keeps everything', () => {
    const line = { funnel_stage: 'awareness', name: 'batch-job', ip: '10.0.0.1', address: 'rack 4' };
    expect(normalizeFunnelEvent(line, 'http')).toBe(line);
  });

  it('a bridged old line keeps every field it came with', () => {
    const out = normalizeFunnelEvent({ message: 'User signup', user_email: 'a@b.com', user_id: 'u1' }, 'hey-youre-hired');
    expect(out).toMatchObject({ funnel_stage: 'signup', user_email: 'a@b.com', user_id: 'u1' });
  });
});

describe('maths fixes', () => {
  it('handles a very large product without running out of stack', () => {
    const events: FunnelEvent[] = [at(T0, 'signup', 'u')];
    for (let i = 0; i < 200_000; i++) events.push(at(T0 + 1000 + i * 10, 'use', 'u'));
    const r = report(events);
    expect(r.totals.events).toBe(200_001);
    expect(r.totals.lastEventAt).not.toBeNull();
  });

  it('counts someone who cancels, comes back, and cancels again as cancelled', () => {
    const r = report([at(T0, 'signup', 'u'), at(T0 + DAY, 'paid', 'u'), at(T0 + 5 * DAY, 'churn', 'u'), at(T0 + 9 * DAY, 'paid', 'u'), at(T0 + 20 * DAY, 'churn', 'u')]);
    expect(r.stopping.cancelled).toBe(1);
  });

  it('counts a renewal from an older customer as money in, without calling them a new payer', () => {
    const r = report(
      [at(T0 - 20 * DAY, 'signup', 'old'), at(T0 - 19 * DAY, 'paid', 'old', { amountCents: 2499, plan: 'pro' }), at(T0 + 11 * DAY, 'paid', 'old', { amountCents: 2499, plan: 'pro' })],
    );
    expect(r.movingToPaid).toMatchObject({ payers: 0, payments: 1, revenueCents: 2499 });
    expect(r.movingToPaid.plans).toEqual([{ plan: 'pro', payers: 1, revenueCents: 2499 }]);
  });

  it('two people who happen to send the same event id are still two people', () => {
    const r = report([
      at(T0, 'signup', 'a'), at(T0 + HOUR, 'use', 'a', { eventId: '1' }),
      at(T0, 'signup', 'b'), at(T0 + HOUR, 'use', 'b', { eventId: '1' }),
    ]);
    expect(r.getIn.find((x) => x.stage === 'activate')?.people).toBe(2);
  });

  it('one late evening that crosses midnight UTC is not "came back"', () => {
    const evening = T0 + 23.5 * HOUR;
    const r = report([at(T0, 'signup', 'u'), at(evening, 'use', 'u'), at(evening + 1.5 * HOUR, 'use', 'u')]);
    expect(r.getIn.find((x) => x.stage === 'return')?.people).toBe(0);
    const r2 = report([at(T0, 'signup', 'u'), at(evening, 'use', 'u'), at(evening + 14 * HOUR, 'use', 'u')]);
    expect(r2.getIn.find((x) => x.stage === 'return')?.people).toBe(1);
  });

  it('a checkout started a minute ago is not "left at checkout" yet', () => {
    const r = report([at(T0, 'signup', 'u'), at(NOW - 60_000, 'checkout', 'u'), at(T0, 'signup', 'v'), at(NOW - 3 * HOUR, 'checkout', 'v')]);
    expect(r.movingToPaid.checkoutAbandoned).toBe(1);
  });
});
