import { describe, it, expect } from 'vitest';
import { buildProductHealth, perMonthCents } from './health';
import { FunnelEvent } from './compute';
import { findFunnelProduct, FUNNEL_PRODUCTS } from './model';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 20, 2); // an evening, Eastern
const ht = findFunnelProduct('homework-tree')!;

let seq = 0;
const ago = (ms: number, stage: FunnelEvent['stage'], userId: string, extra: Partial<FunnelEvent> = {}): FunnelEvent => ({
  ts: NOW - ms + ++seq, stage, event: extra.event ?? stage, userId, ...extra,
});
const read = (ms: number, who: string) => ago(ms, 'use', who, { event: 'sheet_read' });
const num = (h: NonNullable<ReturnType<typeof buildProductHealth>>, key: string) => h.numbers.find((n) => n.key === key)!;

function sample(): FunnelEvent[] {
  return [
    // Family A: steady user, read 3 sheets over the week (3rd one today), pays monthly, renewed today
    ago(40 * DAY, 'signup', 'a'), ago(35 * DAY, 'paid', 'a', { event: 'family_plan_paid', amountCents: 699, interval: 'month' }),
    ago(5 * DAY, 'paid', 'a', { event: 'family_plan_renewed', amountCents: 699, interval: 'month' }),
    read(30 * DAY, 'a'), read(29 * DAY, 'a'), read(2 * HOUR, 'a'),
    // Family B: new this week, read 2 sheets today, hit the free limit, started checkout, paid yearly today
    ago(3 * DAY, 'signup', 'b'), read(3 * HOUR, 'b'), read(2 * HOUR, 'b'),
    ago(2 * HOUR, 'paywall', 'b', { event: 'trial_used' }), ago(90 * 60_000, 'checkout', 'b', { event: 'checkout_started' }),
    ago(HOUR, 'paid', 'b', { event: 'family_plan_paid', amountCents: 5999, interval: 'year' }),
    // Family C: read one sheet 20 days ago, nothing since (quiet); cancelled 2 days ago after paying long ago
    ago(60 * DAY, 'signup', 'c'), ago(50 * DAY, 'paid', 'c', { event: 'family_plan_paid', amountCents: 699, interval: 'month' }),
    read(20 * DAY, 'c'), ago(2 * DAY, 'churn', 'c', { event: 'family_plan_cancelled' }),
    // Family D: read a sheet 10 days ago and again yesterday (second week, for the first time)
    ago(12 * DAY, 'signup', 'd'), read(10 * DAY, 'd'), read(30 * HOUR, 'd'),
  ];
}

describe('product health: Homework Tree', () => {
  const h = buildProductHealth(ht, sample(), NOW)!;

  it('money: what came in today, who paid for the first time, renewals', () => {
    expect(num(h, 'money_in')).toMatchObject({ now: 5999, before: 0, period: 'day', unit: 'cents' });
    expect(num(h, 'new_payers')).toMatchObject({ now: 1, before: 0 });
    expect(num(h, 'renewals')).toMatchObject({ now: 0 });
  });

  it('paying families right now and the monthly run-rate (yearly spread over 12 months)', () => {
    // A (monthly) and B (yearly) pay; C cancelled
    expect(num(h, 'paying_now')).toMatchObject({ now: 2, period: 'right_now' });
    expect(num(h, 'run_rate').now).toBe(699 + Math.round(5999 / 12));
    // a week ago: A and C were paying, B had not started
    expect(num(h, 'paying_now').before).toBe(2);
  });

  it('the unit of work: sheets read today, and by how many families', () => {
    expect(num(h, 'uses_today')).toMatchObject({ now: 3, period: 'day' });
    expect(num(h, 'users_today').now).toBe(2);
  });

  it('active families this week and the typical one', () => {
    expect(num(h, 'active_week').now).toBe(3); // A, B, D
    expect(num(h, 'typical_week')).toMatchObject({ now: 1, unit: 'decimal' }); // 1, 2, 1 -> middle is 1
  });

  it('leading signals: reached the 3rd sheet, came back a second week, hit the limit, started checkout', () => {
    expect(num(h, 'hooked').now).toBe(1); // A's 3rd sheet ever was today
    // A: first sheet 30 days ago, next one a week or more later is today's. D: 10 days ago, then yesterday.
    expect(num(h, 'second_week').now).toBe(2);
  });

  it('quiet and cancelled', () => {
    expect(num(h, 'quiet').now).toBe(1); // C
    expect(num(h, 'cancelled').now).toBe(1); // C
    expect(num(h, 'hit_limit').now).toBe(1);
    expect(num(h, 'started_checkout').now).toBe(1);
  });

  it('gives one sentence that can be read out', () => {
    expect(h.line).toBe(
      'Homework Tree, last 24 hours: 3 sheets read by 2 families, 3 families active this week, about 1 sheet per active family this week, 1 hit the free limit this week, 1 new paying family, $59.99 in, 1 cancelled this week.',
    );
  });

  it('says plainly when there is nothing yet, and never divides by zero', () => {
    const empty = buildProductHealth(ht, [], NOW)!;
    expect(empty.hasData).toBe(false);
    expect(empty.line).toBe('Homework Tree, last 24 hours: no activity recorded yet.');
    for (const n of empty.numbers) expect(Number.isFinite(n.now) && Number.isFinite(n.before)).toBe(true);
  });

  it('a renewal is money in but not a new paying family', () => {
    const r = buildProductHealth(ht, [ago(HOUR, 'paid', 'old', { event: 'family_plan_renewed', amountCents: 699, interval: 'month' })], NOW)!;
    expect(num(r, 'money_in').now).toBe(699);
    expect(num(r, 'renewals').now).toBe(1);
    expect(num(r, 'new_payers').now).toBe(0);
    expect(num(r, 'paying_now').now).toBe(1);
  });

  it('a family that cancels and then pays again is paying, not cancelled', () => {
    const r = buildProductHealth(ht, [
      ago(20 * DAY, 'paid', 'x', { event: 'family_plan_paid', amountCents: 699, interval: 'month' }),
      ago(3 * DAY, 'churn', 'x', { event: 'family_plan_cancelled' }),
      ago(DAY * 2, 'paid', 'x', { event: 'family_plan_paid', amountCents: 699, interval: 'month' }),
    ], NOW)!;
    expect(num(r, 'paying_now').now).toBe(1);
    expect(num(r, 'cancelled').now).toBe(0);
  });

  it('carries the honest limits and nothing about a child', () => {
    expect(h.notes.join(' ')).toMatch(/Nothing about a child is collected/);
    expect(h.notes.join(' ')).toMatch(/iPhone app are not counted/);
    expect(JSON.stringify(h)).not.toMatch(/child_|learner|student/i);
  });
});

describe('product health: which products have one', () => {
  it('only products that declare it', () => {
    expect(FUNNEL_PRODUCTS.filter((p) => p.health).map((p) => p.slug)).toEqual(['homework-tree']);
    expect(buildProductHealth(findFunnelProduct('directors-palette')!, [], NOW)).toBeNull();
  });
});

describe('product health: cases found in review', () => {
  const paid = (ms: number, who: string, cents: number | undefined, interval?: string, event = 'family_plan_paid') =>
    ago(ms, 'paid', who, { event, amountCents: cents, interval });

  it('says plainly that yearly plans drop out of view after the history LogNog keeps', () => {
    const h = buildProductHealth(ht, [read(HOUR, 'a')], NOW)!;
    expect(h.notes.join(' ')).toMatch(/a yearly plan drops out 90 days after it was paid/);
    expect(num(h, 'paying_now').what).toMatch(/in the last 90 days/);
  });

  it('never guesses a plan length: unknown ones are left out of the run-rate and named', () => {
    expect(perMonthCents(5999, 'year')).toBeCloseTo(499.9, 1);
    expect(perMonthCents(5999, 'yearly')).toBeCloseTo(499.9, 1);
    expect(perMonthCents(699, 'month')).toBe(699);
    expect(perMonthCents(699, 'week')).toBeCloseTo(3029, 0);
    expect(perMonthCents(5999, undefined)).toBeNull();
    expect(perMonthCents(5999, 'one_time')).toBeNull();
    const h = buildProductHealth(ht, [paid(DAY * 3, 'a', 5999, undefined), paid(DAY * 3, 'b', 699, 'month')], NOW)!;
    expect(num(h, 'paying_now').now).toBe(2);
    expect(num(h, 'run_rate').now).toBe(699); // not 699 + 5999
    expect(h.notes.join(' ')).toMatch(/1 paying family is left out of the run-rate/);
  });

  it('an old customer who cancelled and pays again today is not a new paying family', () => {
    const h = buildProductHealth(ht, [
      paid(40 * DAY, 'old', 699, 'month', 'family_plan_renewed'),
      ago(10 * DAY, 'churn', 'old', { event: 'family_plan_cancelled' }),
      paid(HOUR, 'old', 699, 'month'),
    ], NOW)!;
    expect(num(h, 'new_payers').now).toBe(0);
    expect(num(h, 'money_in').now).toBe(699);
    expect(num(h, 'paying_now').now).toBe(1);
  });

  it('"for the first time" is only said about families whose beginning is in view', () => {
    // First seen at the very edge of the 90 days: they may have been reading sheets long before.
    const edge = [read(89 * DAY, 'longtime'), read(50 * DAY, 'longtime'), read(HOUR, 'longtime')];
    const h = buildProductHealth(ht, edge, NOW)!;
    expect(num(h, 'hooked').now).toBe(0);
    expect(num(h, 'second_week').now).toBe(0);
    // A family that started three weeks ago and reads its 3rd sheet today does count.
    const fresh = buildProductHealth(ht, [read(20 * DAY, 'new'), read(19 * DAY, 'new'), read(HOUR, 'new')], NOW)!;
    expect(num(fresh, 'hooked').now).toBe(1);
  });

  it('a payment and a cancellation at the same moment count once: as paying', () => {
    const t = NOW - 2 * DAY;
    const h = buildProductHealth(ht, [
      { ts: t, stage: 'paid', event: 'family_plan_paid', userId: 'x', amountCents: 699, interval: 'month' },
      { ts: t, stage: 'churn', event: 'family_plan_cancelled', userId: 'x' },
    ], NOW)!;
    expect(num(h, 'paying_now').now + num(h, 'cancelled').now).toBe(1);
    expect(num(h, 'paying_now').now).toBe(1);
  });

  it('a payment with no amount is never read out as "$0 in"', () => {
    const h = buildProductHealth(ht, [paid(HOUR, 'a', undefined, 'month')], NOW)!;
    expect(h.line).toMatch(/1 new paying family, money not reported,/);
    expect(h.line).not.toMatch(/\$0 in/);
    expect(h.notes.join(' ')).toMatch(/1 payment today came with no amount/);
  });

  it('with nobody active this week the sentence does not say "about 0 sheets per active family"', () => {
    const h = buildProductHealth(ht, [read(30 * DAY, 'a')], NOW)!;
    expect(h.line).not.toMatch(/per active family/);
    expect(h.line).toMatch(/0 families active this week, 0 hit the free limit this week/);
  });
});
