import { describe, it, expect } from 'vitest';
import { buildFunnelReport, buildPeople, FunnelEvent } from './compute';
import { FunnelProduct } from './model';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1); // window start
const NOW = T0 + 40 * DAY;

const product: FunnelProduct = {
  slug: 'demo',
  name: 'Demo',
  indexes: ['demo'],
  quietDays: 14,
  activation: 'first_use',
  activationMeans: 'first use',
  paidMeans: 'paid',
  notApplicable: [],
};

let seq = 0;
function ev(day: number, stage: FunnelEvent['stage'], who: { a?: string; u?: string }, extra: Partial<FunnelEvent> = {}): FunnelEvent {
  return { ts: T0 + day * DAY + ++seq, stage, event: extra.event ?? stage, anonId: who.a, userId: who.u, ...extra };
}
const report = (events: FunnelEvent[], p = product) => buildFunnelReport(p, events, { from: T0, to: NOW, now: NOW });
const rung = (list: ReturnType<typeof report>['getIn'], stage: string) => list.find((r) => r.stage === stage)!;

describe('funnel maths: who is one person', () => {
  it('ties an anonymous visitor to the account they create', () => {
    const { people } = buildPeople([ev(0, 'visit', { a: 'a1' }), ev(0, 'signup', { a: 'a1', u: 'u1' }), ev(1, 'use', { u: 'u1' })]);
    expect(people.size).toBe(1);
    expect([...people.keys()]).toEqual(['u:u1']);
  });

  it('counts events with no id separately instead of inventing a person', () => {
    const { people, withoutId } = buildPeople([ev(0, 'visit', {}), ev(0, 'visit', { a: 'a1' })]);
    expect(people.size).toBe(1);
    expect(withoutId).toBe(1);
  });

  it('counts a retried payment (same event id) once', () => {
    const r = report([
      ev(0, 'signup', { u: 'u1' }),
      ev(1, 'paid', { u: 'u1' }, { eventId: 'cs_1', amountCents: 699 }),
      ev(1, 'paid', { u: 'u1' }, { eventId: 'cs_1', amountCents: 699 }),
    ]);
    expect(r.movingToPaid.payments).toBe(1);
    expect(r.movingToPaid.revenueCents).toBe(699);
  });
});

describe('funnel maths: the two ladders', () => {
  const events = [
    // 4 visitors: a1 leaves, a2 starts sign-up and leaves, a3 signs up only, a4 goes all the way
    ev(0, 'visit', { a: 'a1' }, { source: 'tiktok' }),
    ev(0, 'visit', { a: 'a2' }, { source: 'tiktok' }),
    ev(0, 'signup_start', { a: 'a2' }, { event: 'signup_form_opened' }),
    ev(0, 'visit', { a: 'a3' }, { source: 'google' }),
    ev(0, 'signup', { a: 'a3', u: 'u3' }),
    ev(0, 'visit', { a: 'a4' }, { source: 'google' }),
    ev(0, 'signup_start', { a: 'a4' }),
    ev(0, 'signup', { a: 'a4', u: 'u4' }),
    ev(1, 'use', { u: 'u4' }),
    ev(3, 'use', { u: 'u4' }),
    ev(3, 'paywall', { u: 'u4' }),
    ev(3, 'checkout', { u: 'u4' }),
    ev(3, 'paid', { u: 'u4' }, { amountCents: 2499, plan: 'pro' }),
  ];
  const r = report(events);

  it('counts people at each rung and the drop between rungs', () => {
    expect(r.getIn.map((x) => [x.stage, x.people])).toEqual([
      ['visit', 4],
      ['signup_start', 3], // a3 skipped the "start" event but signed up, so still counts
      ['signup', 2],
      ['activate', 1],
      ['return', 1],
    ]);
    expect(rung(r.getIn, 'signup').pctOfPrevious).toBe(66.7);
    expect(rung(r.getIn, 'signup').lost).toBe(1);
    expect(rung(r.getIn, 'activate').pctOfTop).toBe(25);
  });

  it('never lets a later rung be bigger than the one before it', () => {
    for (const l of [r.getIn, r.pay]) {
      const counts = l.filter((x) => x.applies).map((x) => x.people);
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  it('builds the paying ladder from sign-up', () => {
    expect(r.pay.map((x) => [x.stage, x.people])).toEqual([
      ['signup', 2],
      ['paywall', 1],
      ['checkout', 1],
      ['paid', 1],
    ]);
  });

  it('shows where sign-ups come from and how well each source turns into accounts', () => {
    expect(r.bySource).toEqual([
      { source: 'google', visitors: 2, startedSignup: 2, signedUp: 2, signupRate: 100 },
      { source: 'tiktok', visitors: 2, startedSignup: 1, signedUp: 0, signupRate: 0 },
    ]);
    expect(r.lastStepBeforeLeaving).toEqual([
      { event: 'signup_form_opened', people: 1 },
      { event: 'visit', people: 1 },
    ]);
  });

  it('gives a zero-safe answer for an empty product', () => {
    const empty = report([]);
    expect(empty.getIn.every((x) => x.people === 0 && x.pctOfPrevious === null && !x.reported)).toBe(true);
    expect(empty.movingToPaid.medianDaysSignupToPaid).toBeNull();
    expect(empty.notReported).toContain('visit');
  });

  it('marks a stage that does not exist for the product as "does not apply", not zero', () => {
    const r2 = report(events, { ...product, notApplicable: ['signup_start'] });
    expect(rung(r2.getIn, 'signup_start').applies).toBe(false);
    expect(rung(r2.getIn, 'signup').pctOfPrevious).toBe(50); // measured against visitors
    expect(r2.notReported).not.toContain('signup_start');
  });

  it('does not count an old customer as new when they show up in the window', () => {
    const r3 = report([ev(-30, 'signup', { u: 'old' }), ev(2, 'use', { u: 'old' }), ev(2, 'signup', { u: 'new' })]);
    expect(rung(r3.getIn, 'signup').people).toBe(1);
    expect(r3.stopping.signedUp).toBe(2);
  });

  it('uses the product\'s own activation event when it declares one', () => {
    const explicit = { ...product, activation: 'explicit' as const };
    const r4 = report([ev(0, 'signup', { u: 'u1' }), ev(1, 'use', { u: 'u1' }), ev(0, 'signup', { u: 'u2' }), ev(1, 'activate', { u: 'u2' })], explicit);
    expect(rung(r4.getIn, 'activate').people).toBe(1);
  });
});

describe('funnel maths: when people stop', () => {
  it('splits accounts into active, quiet, never used and cancelled', () => {
    const r = report([
      ev(0, 'signup', { u: 'active' }),
      ev(38, 'use', { u: 'active' }),
      ev(0, 'signup', { u: 'quiet' }),
      ev(1, 'use', { u: 'quiet' }, { event: 'cover_letter' }),
      ev(5, 'use', { u: 'quiet' }, { event: 'job_search' }),
      ev(0, 'signup', { u: 'never' }),
      ev(39, 'signup', { u: 'brand_new' }), // too new to call lost
      ev(0, 'signup', { u: 'left' }),
      ev(1, 'paid', { u: 'left' }),
      ev(20, 'churn', { u: 'left' }),
      ev(38, 'use', { u: 'left' }),
    ]);
    expect(r.stopping).toMatchObject({ signedUp: 5, active: 3, quiet: 1, neverUsed: 1, cancelled: 1 });
    expect(r.stopping.lastThingBeforeQuiet).toEqual([{ event: 'job_search', people: 1 }]);
    expect(r.stopping.lastedBuckets.find((b) => b.label === '1–6 days')?.people).toBe(1);
  });

  it('does not count someone as cancelled once they pay again', () => {
    const r = report([ev(0, 'signup', { u: 'u' }), ev(1, 'paid', { u: 'u' }), ev(5, 'churn', { u: 'u' }), ev(9, 'paid', { u: 'u' })]);
    expect(r.stopping.cancelled).toBe(0);
  });

  it('scores weekly retention, and leaves unfinished weeks blank instead of 0%', () => {
    const r = report([
      ev(0, 'signup', { u: 'a' }),
      ev(8, 'use', { u: 'a' }), // week 1
      ev(0, 'signup', { u: 'b' }),
      ev(24, 'signup', { u: 'late' }), // 16 days old: week 1 is done, week 2 is not
      ev(32, 'use', { u: 'late' }),
    ]);
    const first = r.stopping.retention[0];
    expect(first.signedUp).toBe(2);
    expect(first.weeks[0]).toBe(50);
    expect(first.weeks[1]).toBe(0);
    const last = r.stopping.retention[r.stopping.retention.length - 1];
    expect(last.weeks[0]).toBe(100);
    expect(last.weeks[1]).toBeNull();
    expect(last.weeks[3]).toBeNull();
  });
});

describe('funnel maths: paying', () => {
  const events = [
    ev(0, 'signup', { u: 'p1' }, { cohort: 'invited_tester' }),
    ev(1, 'use', { u: 'p1' }, { event: 'export_done' }),
    ev(2, 'use', { u: 'p1' }, { event: 'export_done' }),
    ev(2, 'paywall', { u: 'p1' }, { event: 'limit_hit' }),
    ev(4, 'paid', { u: 'p1' }, { amountCents: 699, plan: 'monthly', cohort: 'paying' }),
    ev(34, 'paid', { u: 'p1' }, { amountCents: 699, plan: 'monthly' }),
    ev(0, 'signup', { u: 'p2' }),
    ev(0, 'use', { u: 'p2' }, { event: 'export_done' }),
    ev(10, 'paid', { u: 'p2' }, { amountCents: 5999, plan: 'yearly' }),
    ev(0, 'signup', { u: 'n1' }),
    ev(1, 'use', { u: 'n1' }, { event: 'browse' }),
    ev(0, 'signup', { u: 'n2' }),
    ev(1, 'use', { u: 'n2' }, { event: 'export_done' }),
    ev(2, 'checkout', { u: 'n2' }),
  ];
  const r = report(events);

  it('shows what payers did first, against people who never paid', () => {
    expect(r.beforePaying.payers).toBe(2);
    expect(r.beforePaying.nonPayers).toBe(2);
    const exportDone = r.beforePaying.actions.find((a) => a.event === 'export_done')!;
    expect(exportDone).toEqual({ event: 'export_done', payersPct: 100, nonPayersPct: 50, lift: 2 });
    expect(r.beforePaying.actions.find((a) => a.event === 'limit_hit')?.lift).toBeNull(); // no non-payer did it
    // ladder steps (sign-up, checkout) are not things they did in the product
    expect(r.beforePaying.actions.map((x) => x.event).sort()).toEqual(['export_done', 'limit_hit']);
    expect(r.beforePaying.medianUseDaysBeforePaying).toBe(1.5);
  });

  it('describes the move to paying: how long, which plan, how much', () => {
    expect(r.movingToPaid).toMatchObject({
      payers: 2,
      payments: 3,
      revenueCents: 699 + 699 + 5999,
      medianDaysSignupToPaid: 7,
      repeatPayers: 1,
      checkoutAbandoned: 1,
    });
    expect(r.movingToPaid.plans).toEqual([
      { plan: 'monthly', payers: 1, payments: 2, paymentsWithoutAmount: 0, revenueCents: 1398 },
      { plan: 'yearly', payers: 1, payments: 1, paymentsWithoutAmount: 0, revenueCents: 5999 },
    ]);
  });

  it('keeps a tester in the tester group even after they pay', () => {
    expect(r.movingToPaid.cohorts).toContainEqual({ cohort: 'invited_tester', payers: 1 });
    expect(r.movingToPaid.cohorts.find((c) => c.cohort === 'paying')).toBeUndefined();
  });
});
