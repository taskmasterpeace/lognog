/**
 * Product health: a handful of nightly numbers for a product, in the product's
 * own words ("sheets read", "families"), worked out from the same funnel
 * events as the ladders. Nothing new is collected for it.
 *
 * Only products that declare `health` in model.ts get one (Homework Tree today).
 * "Today" is the last 24 hours and is shown next to the 24 hours before;
 * "this week" is the last 7 days next to the 7 days before.
 */
import { buildPeople, FunnelEvent } from './compute.js';
import { FunnelProduct } from './model.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface HealthNumber {
  key: string;
  label: string;
  /** Plain words: what it is and why it matters. */
  what: string;
  now: number;
  before: number;
  /** What `now` and `before` cover. */
  period: 'day' | 'week' | 'right_now';
  /** 'count' | 'cents' | 'decimal' (one decimal place) */
  unit: 'count' | 'cents' | 'decimal';
}

export interface ProductHealth {
  product: { slug: string; name: string };
  generatedAt: string;
  hasData: boolean;
  numbers: HealthNumber[];
  /** One sentence for reading out loud. */
  line: string;
  /** Honest limits, shown under the block. */
  notes: string[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function dollars(cents: number): string {
  const d = cents / 100;
  return d.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: d % 1 === 0 ? 0 : 2 });
}
const plural = (n: number, one: string, many: string): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

interface Snapshot {
  moneyCents: number;
  newPayers: number;
  renewals: number;
  usesDay: number;
  usersDay: number;
  activeWeek: number;
  typicalUsesWeek: number;
  hooked: number;
  secondWeek: number;
  hitLimit: number;
  startedCheckout: number;
  cancelledWeek: number;
  payingNow: number;
  runRateCents: number;
  /** Paying people whose plan length is unknown, so they are left out of the run-rate. */
  runRateUnknown: number;
  /** Payments today that came with no amount. */
  paymentsToday: number;
  paymentsTodayNoAmount: number;
  quiet: number;
}

/** Cents per month for a plan length, or null when the length is not one we know. */
export function perMonthCents(cents: number, interval: string | undefined): number | null {
  const i = (interval || '').toLowerCase();
  if (i === 'month' || i === 'monthly') return cents;
  if (i === 'year' || i === 'yearly' || i === 'annual') return cents / 12;
  if (i === 'week' || i === 'weekly') return (cents * 52) / 12;
  return null; // missing, one_time or anything else: not guessed
}

/** Everything as it stood at `at`, using only events up to then. */
function snapshot(product: FunnelProduct, events: FunnelEvent[], at: number, historyStart: number): Snapshot {
  const cfg = product.health!;
  const { people } = buildPeople(events.filter((e) => e.ts <= at));
  const dayStart = at - DAY;
  const weekStart = at - 7 * DAY;
  const quietMs = product.quietDays * DAY;
  const s: Snapshot = {
    moneyCents: 0, newPayers: 0, renewals: 0, usesDay: 0, usersDay: 0, activeWeek: 0, typicalUsesWeek: 0,
    hooked: 0, secondWeek: 0, hitLimit: 0, startedCheckout: 0, cancelledWeek: 0, payingNow: 0, runRateCents: 0, runRateUnknown: 0,
    paymentsToday: 0, paymentsTodayNoAmount: 0, quiet: 0,
  };
  const weekCounts: number[] = [];
  for (const p of people.values()) {
    const uses = p.events.filter((e) => e.stage === 'use').map((e) => e.ts);
    const usesToday = uses.filter((t) => t > dayStart).length;
    const usesWeek = uses.filter((t) => t > weekStart).length;
    s.usesDay += usesToday;
    if (usesToday > 0) s.usersDay++;
    if (usesWeek > 0) {
      s.activeWeek++;
      weekCounts.push(usesWeek);
    }
    // "For the first time" can only be said about someone whose beginning is in
    // view. A family first seen right at the edge of the history we hold may have
    // been using it long before, so they are not counted as newly hooked.
    const beginningInView = p.firstTs > historyStart + 7 * DAY;
    // Hooked: the Nth use ever fell inside this week.
    if (beginningInView && uses.length >= cfg.hookedAt && uses[cfg.hookedAt - 1] > weekStart) s.hooked++;
    // Second week: first use that is 7+ days after their very first use fell inside this week.
    if (beginningInView && uses.length > 1) {
      const later = uses.find((t) => t - uses[0] >= 7 * DAY);
      if (later !== undefined && later > weekStart) s.secondWeek++;
    }
    if (p.events.some((e) => e.stage === 'paywall' && e.ts > weekStart)) s.hitLimit++;
    if (p.events.some((e) => e.stage === 'checkout' && e.ts > weekStart)) s.startedCheckout++;

    let lastPaid: { ts: number; cents: number } | undefined;
    let lastInterval: string | undefined;
    let lastChurn: number | undefined;
    for (const e of p.events) {
      if (e.stage === 'paid') {
        const renewal = /renew/.test(e.event);
        if (e.ts > dayStart) {
          s.moneyCents += e.amountCents ?? 0;
          s.paymentsToday++;
          if (e.amountCents === undefined) s.paymentsTodayNoAmount++;
          if (renewal) s.renewals++;
        }
        lastPaid = { ts: e.ts, cents: e.amountCents ?? 0 };
        if (e.interval) lastInterval = e.interval;
      } else if (e.stage === 'churn') {
        lastChurn = e.ts;
      }
    }
    // New = their first payment in view is today's and it is not a renewal (same rule as the ladders).
    if (p.firstNewPaid !== undefined && p.firstNewPaid === p.first.paid && p.firstNewPaid > dayStart) s.newPayers++;
    // A payment at or after the cancellation wins: they are paying, not cancelled.
    const cancelledAfterPaying = lastChurn !== undefined && !(lastPaid && lastPaid.ts >= lastChurn);
    if (cancelledAfterPaying && (lastChurn as number) > weekStart) s.cancelledWeek++;
    if (lastPaid && !cancelledAfterPaying) {
      s.payingNow++;
      // Monthly run-rate from what they last paid and how often. Unknown plan lengths are left out, not guessed.
      const perMonth = perMonthCents(lastPaid.cents, lastInterval);
      if (perMonth === null || lastPaid.cents <= 0) s.runRateUnknown++;
      else s.runRateCents += Math.round(perMonth);
    }
    // Quiet: used it at least once, and not for the product's quiet window.
    if (uses.length > 0 && at - uses[uses.length - 1] > quietMs) s.quiet++;
  }
  s.typicalUsesWeek = Math.round(median(weekCounts) * 10) / 10;
  return s;
}

/** Build the health block for one product. Pure: pass the events and the moment. */
/** How far back the caller's events go, in days (LogNog keeps 90). */
export const HEALTH_HISTORY_DAYS = 90;

export function buildProductHealth(product: FunnelProduct, events: FunnelEvent[], now: number, historyDays: number = HEALTH_HISTORY_DAYS): ProductHealth | null {
  const cfg = product.health;
  if (!cfg) return null;
  const usable = events.filter((e) => Number.isFinite(e.ts) && e.ts <= now);
  const historyStart = now - historyDays * DAY;
  const today = snapshot(product, usable, now, historyStart);
  const yesterday = snapshot(product, usable, now - DAY, historyStart);
  const lastWeek = snapshot(product, usable, now - 7 * DAY, historyStart);
  const U = cfg.unitPlural;
  const P = cfg.peoplePlural;
  const n = (key: string, label: string, what: string, a: number, b: number, period: HealthNumber['period'], unit: HealthNumber['unit'] = 'count'): HealthNumber => ({ key, label, what, now: a, before: b, period, unit });

  const numbers: HealthNumber[] = [
    n('money_in', 'Money in', 'Payments confirmed by the payment provider, renewals included.', today.moneyCents, yesterday.moneyCents, 'day', 'cents'),
    n('new_payers', `New paying ${P}`, `${cap(P)} that paid for the first time.`, today.newPayers, yesterday.newPayers, 'day'),
    n('renewals', 'Renewals', 'Existing customers whose plan renewed.', today.renewals, yesterday.renewals, 'day'),
    n('paying_now', `Paying ${P}`, `${cap(P)} whose latest payment in the last ${historyDays} days has not been followed by a cancellation.`, today.payingNow, lastWeek.payingNow, 'right_now'),
    n('run_rate', 'Monthly run-rate', `What those paying ${P} are worth per month (yearly plans spread over 12 months; payments with an unknown plan length are left out).`, today.runRateCents, lastWeek.runRateCents, 'right_now', 'cents'),
    n('uses_today', cap(U), `The core unit of work: how many ${U} in the last 24 hours.`, today.usesDay, yesterday.usesDay, 'day'),
    n('users_today', `${cap(P)} that used it`, `How many ${P} did at least one.`, today.usersDay, yesterday.usersDay, 'day'),
    n('active_week', `Active ${P}`, `${cap(P)} with at least one in the last 7 days.`, today.activeWeek, lastWeek.activeWeek, 'week'),
    n('typical_week', `${cap(cfg.unitShort)} per active ${cfg.personOne}`, `The typical active ${cfg.personOne} this week (the middle one). Low means trying it once; higher means real use.`, today.typicalUsesWeek, lastWeek.typicalUsesWeek, 'week', 'decimal'),
    n('hooked', `Reached ${cfg.hookedAt} ${cfg.unitShort}`, `${cap(P)} that reached their ${ordinal(cfg.hookedAt)} for the first time this week. An early sign they will stay.`, today.hooked, lastWeek.hooked, 'week'),
    n('second_week', 'Came back a second week', `${cap(P)} that used it again a week or more after their first time, for the first time.`, today.secondWeek, lastWeek.secondWeek, 'week'),
    n('hit_limit', 'Hit the free limit', `${cap(P)} that ran out of free use or were shown the price.`, today.hitLimit, lastWeek.hitLimit, 'week'),
    n('started_checkout', 'Started checkout', `${cap(P)} that began to pay.`, today.startedCheckout, lastWeek.startedCheckout, 'week'),
    n('quiet', 'Gone quiet', `${cap(P)} that used it before and have not for ${product.quietDays} days.`, today.quiet, lastWeek.quiet, 'right_now'),
    n('cancelled', 'Cancelled', `${cap(P)} that cancelled in the last 7 days.`, today.cancelledWeek, lastWeek.cancelledWeek, 'week'),
  ];

  const hasData = usable.length > 0;
  // Money as said out loud: never "$0" for payments that arrived without an amount.
  const moneySaid =
    today.paymentsToday > 0 && today.paymentsTodayNoAmount >= today.paymentsToday
      ? 'money not reported'
      : `${dollars(today.moneyCents)} in${today.paymentsTodayNoAmount > 0 ? ' (some payments had no amount)' : ''}`;
  const typical = today.activeWeek > 0 ? `about ${today.typicalUsesWeek} ${today.typicalUsesWeek === 1 ? cfg.unitShort.replace(/s$/, '') : cfg.unitShort} per active ${cfg.personOne} this week, ` : '';
  const line = !hasData
    ? `${product.name}, last 24 hours: no activity recorded yet.`
    : `${product.name}, last 24 hours: ${plural(today.usesDay, cfg.unitOneRead, U)} by ${plural(today.usersDay, cfg.personOne, P)}, ` +
      `${plural(today.activeWeek, cfg.personOne, P)} active this week, ` +
      typical +
      `${today.hitLimit.toLocaleString('en-US')} hit the free limit this week, ` +
      `${plural(today.newPayers, `new paying ${cfg.personOne}`, `new paying ${P}`)}, ${moneySaid}, ` +
      `${today.cancelledWeek === 0 ? 'no cancellations this week' : `${today.cancelledWeek.toLocaleString('en-US')} cancelled this week`}.`;

  const notes = [
    ...cfg.notes,
    `LogNog keeps ${historyDays} days. "Paying ${P}" and the run-rate only see payments from that time, so a yearly plan drops out ${historyDays} days after it was paid. "For the first time" numbers only count ${P} first seen in that time.`,
  ];
  if (today.runRateUnknown > 0) notes.push(`${plural(today.runRateUnknown, `paying ${cfg.personOne} is`, `paying ${P} are`)} left out of the run-rate: the payment did not say whether the plan is monthly or yearly.`);
  if (today.paymentsTodayNoAmount > 0) notes.push(`${plural(today.paymentsTodayNoAmount, 'payment', 'payments')} today came with no amount, so money in is understated.`);

  return {
    product: { slug: product.slug, name: product.name },
    generatedAt: new Date(now).toISOString(),
    hasData,
    numbers,
    line,
    notes,
  };
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
