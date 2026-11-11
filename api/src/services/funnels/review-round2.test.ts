/**
 * Cases found in the second review. Each one failed before its fix.
 */
import { describe, it, expect } from 'vitest';
import { normalizeFunnelEvent, findFunnelProduct } from './model';
import { buildFunnelReport, FunnelEvent } from './compute';
import { rowToFunnelEvent } from './store';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1);
const NOW = T0 + 40 * DAY;
const hyh = { ...findFunnelProduct('hey-youre-hired')!, activation: 'first_use' as const };
const at = (ms: number, stage: FunnelEvent['stage'], userId: string, extra: Partial<FunnelEvent> = {}): FunnelEvent => ({ ts: ms, stage, event: extra.event ?? stage, userId, ...extra });
const report = (events: FunnelEvent[]) => buildFunnelReport(hyh, events, { from: T0, to: NOW, now: NOW });
const text = (o: unknown) => JSON.stringify(o);

describe('kids product, second pass', () => {
  it('only accepts a real time as the timestamp', () => {
    for (const bad of ['Timmy cried on May 3 2026', 'Timmy Smith failed maths 2020', 'May 3 2026', '2026']) {
      const out = normalizeFunnelEvent({ funnel_stage: 'use', timestamp: bad, user_id: 'p1' }, 'homework-tree');
      expect(out.timestamp, bad).toBeUndefined();
    }
    expect(normalizeFunnelEvent({ funnel_stage: 'use', timestamp: '2026-11-11T10:00:00Z', user_id: 'p1' }, 'homework-tree').timestamp).toBe('2026-11-11T10:00:00Z');
    expect(normalizeFunnelEvent({ funnel_stage: 'use', timestamp: 1794400000000, user_id: 'p1' }, 'homework-tree').timestamp).toBe(1794400000000);
  });

  it('checks the version field even when the stage name is unknown', () => {
    const out = normalizeFunnelEvent({ funnel_stage: 'zzz', funnel_v: { child: 'Timmy Smith', answers: ['a b c'] }, timestamp: 'Timmy 2020' }, 'homework-tree');
    expect(text(out)).not.toMatch(/Timmy|answers/);
    expect(out.funnel_v).toBe(1);
    const out2 = normalizeFunnelEvent({ funnel_stage: 'zzz', funnel_v: 'Timmy Smith age 7 failed math' }, 'homework-tree');
    expect(text(out2)).not.toMatch(/Timmy/);
  });

  it('never falls back to storing the original when an event cannot be read', () => {
    const hostile = [
      { funnel_stage: 'use', amount_cents: { toString: 1, valueOf: 1 }, child_name: 'Timmy Smith', message: 'Timmy got 4 wrong' },
      { funnel_stage: { toString: 1 }, child_name: 'Timmy Smith' },
      { funnel_stage: 'use', funnel_v: { toString: 1, valueOf: 1 }, message: 'Timmy' },
      { funnel_stage: 'use', props: { get x() { throw new Error('boom'); } }, note: 'Timmy' },
    ];
    for (const event of hostile) {
      let out: Record<string, unknown> | undefined;
      expect(() => { out = normalizeFunnelEvent(event as Record<string, unknown>, 'homework-tree'); }).not.toThrow();
      expect(text(out)).not.toMatch(/Timmy/);
      expect(out).not.toBe(event);
    }
  });

  it('builds the stored line from the allowlist, so an unknown field cannot ride along', () => {
    const out = normalizeFunnelEvent(
      { funnel_stage: 'paid', user_id: 'p_9f2c', amount_cents: 699, plan: 'family', interval: 'month', hostname: "Timmy's iPad", app_name: 'x', anything_else: 'Timmy', __proto__: { leaked: 'Timmy' } },
      'homework-tree',
    );
    expect(Object.keys(out).sort()).toEqual(['amount_cents', 'funnel_event', 'funnel_stage', 'funnel_v', 'interval', 'level', 'message', 'plan', 'product', 'user_id']);
  });
});

describe('lines in other indexes, second pass', () => {
  it('a line that names an ordinary product from another index is stored exactly as sent', () => {
    const line = { funnel_stage: 'paid', user_id: 'a@b.com', product: 'directors-palette' };
    expect(normalizeFunnelEvent(line, 'someapp')).toBe(line);
    const old = { message: 'Generation completed', event: 'generation_completed', product: 'directors-palette' };
    expect(normalizeFunnelEvent(old, 'someapp')).toBe(old);
  });

  it('a prototype key on an ordinary product line is dropped without touching anything else', () => {
    const line = JSON.parse('{"funnel_stage":"use","user_id":"u1","__proto__":{"polluted":true},"keep":"yes"}');
    const out = normalizeFunnelEvent(line, 'directors-palette');
    expect(out.keep).toBe('yes');
    expect((out as { polluted?: boolean }).polluted).toBeUndefined();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe('maths, second pass', () => {
  it('stays fast with tens of thousands of sign-ups in one week', () => {
    const events: FunnelEvent[] = [];
    for (let i = 0; i < 40_000; i++) events.push(at(T0 + DAY + i, 'signup', `u${i}`));
    const started = Date.now();
    const r = report(events);
    expect(r.stopping.signedUp).toBe(40_000);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('a renewal from a customer whose first payment is out of view is money in, not a new payer', () => {
    const r = report([at(T0 + 5 * DAY, 'paid', 'yearly_customer', { event: 'family_plan_renewed', amountCents: 5999, plan: 'family' })]);
    expect(r.movingToPaid).toMatchObject({ payers: 0, payments: 1, revenueCents: 5999 });
  });

  it('counts payments that came with no amount instead of adding them as $0', () => {
    const r = report([at(T0, 'signup', 'u'), at(T0 + DAY, 'paid', 'u')]);
    expect(r.movingToPaid).toMatchObject({ payers: 1, payments: 1, paymentsWithoutAmount: 1, revenueCents: 0 });
  });

  it('keeps brand-new accounts that have not used it yet apart from people really using it', () => {
    const r = report([at(NOW - DAY, 'signup', 'fresh'), at(T0, 'signup', 'user'), at(NOW - DAY, 'use', 'user')]);
    expect(r.stopping).toMatchObject({ active: 2, newNotUsedYet: 1 });
  });
});

describe('reading stored rows, second pass', () => {
  it('an object where an id should be is ignored, not turned into one shared person', () => {
    const e = rowToFunnelEvent({ timestamp: '2026-11-01 10:00:00.000', structured_data: JSON.stringify({ funnel_stage: 'use', user_id: { a: 1 }, anon_id: 'a1' }) });
    expect(e?.userId).toBeUndefined();
    expect(e?.anonId).toBe('a1');
  });
});
