/**
 * Funnel maths. Pure functions over a list of funnel events, so the same code
 * runs (and is tested) on ClickHouse and on SQLite.
 *
 * The rules, in plain words (docs/FUNNELS.md has the long version):
 *  - A person is one `user_id`. Before sign-up they are an `anon_id`; the first
 *    event that carries both ties the two together for good.
 *  - "First real use" = the product's `activate` event, or the first `use`.
 *  - "Came back" = a `use` on a later calendar day than the first real use.
 *  - "Went quiet" = signed up, and no `use` for the product's quiet window.
 *  - A person counts at a rung of a ladder if they reached that rung OR any
 *    later rung, so a step a product does not report yet never makes the
 *    numbers climb back up.
 */
import { FunnelProduct, GET_IN_LADDER, PAY_LADDER, STAGE_LABELS, SentStage, isSentStage } from './model.js';

export interface FunnelEvent {
  ts: number; // epoch ms
  stage: SentStage;
  event: string;
  anonId?: string;
  userId?: string;
  eventId?: string;
  source?: string;
  campaign?: string;
  surface?: string;
  cohort?: string;
  plan?: string;
  interval?: string;
  amountCents?: number;
}

export interface LadderRung {
  stage: string;
  label: string;
  people: number;
  /** % of the rung above that got here; null on the first rung or when the rung above is 0. */
  pctOfPrevious: number | null;
  /** People lost between the rung above and this one. */
  lost: number;
  /** % of the first rung. */
  pctOfTop: number | null;
  applies: boolean;
  /** No events of this stage were seen at all: the product is not reporting it yet. */
  reported: boolean;
}

export interface FunnelReport {
  product: { slug: string; name: string; quietDays: number; activationMeans: string; paidMeans: string };
  window: { from: string; to: string; days: number };
  generatedAt: string;
  totals: { events: number; people: number; eventsWithoutId: number; lastEventAt: string | null };
  getIn: LadderRung[];
  pay: LadderRung[];
  /** Why don't they sign up: visitors by where they came from. */
  bySource: Array<{ source: string; visitors: number; startedSignup: number; signedUp: number; signupRate: number | null }>;
  /** Last thing visitors did before leaving without an account. */
  lastStepBeforeLeaving: Array<{ event: string; people: number }>;
  /** When do they stop using it. */
  stopping: {
    signedUp: number;
    active: number;
    quiet: number;
    neverUsed: number;
    cancelled: number;
    /** How long quiet people lasted, from sign-up to last use. */
    lastedBuckets: Array<{ label: string; people: number }>;
    lastThingBeforeQuiet: Array<{ event: string; people: number }>;
    /** Sign-up week cohorts; pct is null while that week has not finished yet. */
    retention: Array<{ week: string; signedUp: number; weeks: Array<number | null> }>;
  };
  /** What comes before paying. */
  beforePaying: {
    payers: number;
    nonPayers: number;
    lookbackDays: number;
    /** Things payers did before their first payment, against everyone who has not paid. */
    actions: Array<{ event: string; payersPct: number; nonPayersPct: number; lift: number | null }>;
    medianUseDaysBeforePaying: number | null;
  };
  /** What the move to paying looks like. */
  movingToPaid: {
    payers: number;
    payments: number;
    revenueCents: number;
    medianDaysSignupToPaid: number | null;
    medianDaysFirstUseToPaid: number | null;
    daysToPayBuckets: Array<{ label: string; people: number }>;
    plans: Array<{ plan: string; payers: number; revenueCents: number }>;
    cohorts: Array<{ cohort: string; payers: number }>;
    repeatPayers: number;
    checkoutAbandoned: number;
  };
  notReported: string[];
}

const DAY = 86_400_000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const round1 = (n: number | null): number | null => (n === null ? null : Math.round(n * 10) / 10);
const dayNumber = (ts: number): number => Math.floor(ts / DAY);
function top(counts: Map<string, number>, n: number): Array<{ event: string; people: number }> {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([event, people]) => ({ event, people }));
}

interface Person {
  key: string;
  isUser: boolean;
  firstTs: number;
  firstSource?: string;
  cohort?: string;
  first: Partial<Record<SentStage, number>>;
  events: FunnelEvent[];
  useDays: Set<number>;
  payments: Array<{ ts: number; cents: number; plan?: string }>;
}

/** Tie anonymous ids to accounts, then group every event under one person. */
export function buildPeople(events: FunnelEvent[]): { people: Map<string, Person>; withoutId: number } {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const anonToUser = new Map<string, string>();
  for (const e of sorted) {
    if (e.anonId && e.userId && !anonToUser.has(e.anonId)) anonToUser.set(e.anonId, e.userId);
  }
  const people = new Map<string, Person>();
  const seenEventIds = new Set<string>();
  let withoutId = 0;
  for (const e of sorted) {
    const userId = e.userId ?? (e.anonId ? anonToUser.get(e.anonId) : undefined);
    const key = userId ? `u:${userId}` : e.anonId ? `a:${e.anonId}` : null;
    if (!key) {
      withoutId++;
      continue;
    }
    // Retries and double-sent webhooks: the same event id counts once.
    if (e.eventId) {
      const dedupe = `${e.stage}|${e.eventId}`;
      if (seenEventIds.has(dedupe)) continue;
      seenEventIds.add(dedupe);
    }
    let p = people.get(key);
    if (!p) {
      p = { key, isUser: !!userId, firstTs: e.ts, first: {}, events: [], useDays: new Set(), payments: [] };
      people.set(key, p);
    }
    p.events.push(e);
    if (p.first[e.stage] === undefined) p.first[e.stage] = e.ts;
    if (!p.firstSource && e.source) p.firstSource = e.source;
    // Where they first came from sticks; a tester who later pays stays a tester.
    if (!p.cohort && e.cohort) p.cohort = e.cohort;
    if (e.stage === 'use' || e.stage === 'activate') p.useDays.add(dayNumber(e.ts));
    if (e.stage === 'paid') p.payments.push({ ts: e.ts, cents: e.amountCents ?? 0, plan: e.plan });
  }
  return { people, withoutId };
}

function milestones(p: Person, product: FunnelProduct) {
  const firstUse = p.first.use;
  const activate = product.activation === 'explicit' ? p.first.activate ?? undefined : p.first.activate ?? firstUse;
  // Explicit products that have not sent `activate` for this person: fall back to nothing (not activated).
  let returned: number | undefined;
  if (activate !== undefined) {
    const d0 = dayNumber(activate);
    for (const e of p.events) {
      if (e.stage === 'use' && dayNumber(e.ts) > d0) {
        returned = e.ts;
        break;
      }
    }
  }
  const useTimes = p.events.filter((e) => e.stage === 'use' || e.stage === 'activate').map((e) => e.ts);
  const lastUse = useTimes.length ? Math.max(...useTimes) : undefined;
  return {
    visit: p.first.visit,
    signup_start: p.first.signup_start,
    signup: p.first.signup,
    activate,
    return: returned,
    paywall: p.first.paywall,
    checkout: p.first.checkout,
    paid: p.first.paid,
    churn: p.first.churn,
    lastUse,
  };
}
type Milestones = ReturnType<typeof milestones>;

function ladder(
  rungs: readonly string[],
  list: Milestones[],
  product: FunnelProduct,
  stagesSeen: Set<string>,
): LadderRung[] {
  const applicable = rungs.filter((r) => !product.notApplicable.includes(r));
  // Reached rung i = has that rung or any later applicable rung.
  const counts = applicable.map((_, i) =>
    list.filter((m) => applicable.slice(i).some((r) => (m as Record<string, number | undefined>)[r] !== undefined)).length,
  );
  const topCount = counts[0] ?? 0;
  const out: LadderRung[] = [];
  for (const stage of rungs) {
    const i = applicable.indexOf(stage);
    if (i === -1) {
      out.push({ stage, label: STAGE_LABELS[stage] ?? stage, people: 0, pctOfPrevious: null, lost: 0, pctOfTop: null, applies: false, reported: false });
      continue;
    }
    const prev = i > 0 ? counts[i - 1] : null;
    const reportedStage = stage === 'return' ? stagesSeen.has('use') : stage === 'activate' ? stagesSeen.has('activate') || (product.activation === 'first_use' && stagesSeen.has('use')) : stagesSeen.has(stage);
    out.push({
      stage,
      label: STAGE_LABELS[stage] ?? stage,
      people: counts[i],
      pctOfPrevious: prev === null ? null : pct(counts[i], prev),
      lost: prev === null ? 0 : Math.max(0, prev - counts[i]),
      pctOfTop: pct(counts[i], topCount),
      applies: true,
      reported: reportedStage,
    });
  }
  return out;
}

function bucket(days: number): string {
  if (days < 1) return 'Same day';
  if (days < 7) return '1–6 days';
  if (days < 30) return '1–4 weeks';
  if (days < 90) return '1–3 months';
  return '3+ months';
}
const BUCKET_ORDER = ['Same day', '1–6 days', '1–4 weeks', '1–3 months', '3+ months'];
function bucketList(daysList: number[]): Array<{ label: string; people: number }> {
  const m = new Map<string, number>();
  for (const d of daysList) m.set(bucket(d), (m.get(bucket(d)) ?? 0) + 1);
  return BUCKET_ORDER.map((label) => ({ label, people: m.get(label) ?? 0 }));
}

export interface ReportOptions {
  /** Window start/end, epoch ms. The ladders count people FIRST SEEN in this window. */
  from: number;
  to: number;
  /** "Now" for quiet/retention maths (defaults to `to`). */
  now?: number;
}

/**
 * Build the whole report for one product.
 * `events` should include history from before `from` (the caller fetches extra
 * lookback) so that an old customer returning is not mistaken for a new one.
 */
export function buildFunnelReport(product: FunnelProduct, events: FunnelEvent[], opts: ReportOptions): FunnelReport {
  const now = opts.now ?? opts.to;
  const usable = events.filter((e) => isSentStage(e.stage) && Number.isFinite(e.ts) && e.ts <= now);
  const { people, withoutId } = buildPeople(usable);
  const all = [...people.values()];
  const stagesSeen = new Set<string>(usable.map((e) => e.stage));

  // --- Ladders: people first seen inside the window, and how far they have got since. ---
  const cohort = all.filter((p) => p.firstTs >= opts.from && p.firstTs <= opts.to);
  const cohortMs = cohort.map((p) => milestones(p, product));
  const getIn = ladder(GET_IN_LADDER, cohortMs, product, stagesSeen);
  const pay = ladder(PAY_LADDER, cohortMs, product, stagesSeen);

  // --- Why don't they sign up ---
  const sourceRows = new Map<string, { visitors: number; startedSignup: number; signedUp: number }>();
  const leftAfter = new Map<string, number>();
  cohort.forEach((p, i) => {
    const m = cohortMs[i];
    const cameIn = m.visit !== undefined || m.signup_start !== undefined || m.signup !== undefined;
    if (!cameIn) return;
    const source = p.firstSource || 'direct / unknown';
    const row = sourceRows.get(source) ?? { visitors: 0, startedSignup: 0, signedUp: 0 };
    row.visitors++;
    if (m.signup_start !== undefined || m.signup !== undefined) row.startedSignup++;
    if (m.signup !== undefined) row.signedUp++;
    sourceRows.set(source, row);
    if (m.signup === undefined) {
      const last = p.events[p.events.length - 1];
      leftAfter.set(last.event, (leftAfter.get(last.event) ?? 0) + 1);
    }
  });
  const bySource = [...sourceRows.entries()]
    .map(([source, r]) => ({ source, ...r, signupRate: pct(r.signedUp, r.visitors) }))
    .sort((a, b) => b.visitors - a.visitors || a.source.localeCompare(b.source))
    .slice(0, 15);

  // --- When do they stop using it (everyone with an account, not just this window) ---
  const quietMs = product.quietDays * DAY;
  const accounts = all.filter((p) => p.first.signup !== undefined);
  let active = 0;
  let quiet = 0;
  let neverUsed = 0;
  let cancelled = 0;
  const lasted: number[] = [];
  const lastBeforeQuiet = new Map<string, number>();
  for (const p of accounts) {
    const m = milestones(p, product);
    if (m.churn !== undefined && !p.payments.some((x) => x.ts > (m.churn as number))) cancelled++;
    if (m.lastUse === undefined) {
      // Give brand-new accounts the quiet window before calling them lost.
      if (now - (m.signup as number) > quietMs) neverUsed++;
      else active++;
      continue;
    }
    if (now - m.lastUse > quietMs) {
      quiet++;
      lasted.push(Math.max(0, (m.lastUse - (m.signup as number)) / DAY));
      const last = [...p.events].reverse().find((e) => e.stage === 'use' || e.stage === 'activate');
      if (last) lastBeforeQuiet.set(last.event, (lastBeforeQuiet.get(last.event) ?? 0) + 1);
    } else active++;
  }

  // Weekly retention by sign-up week. Week N = days 7N..7N+6 after sign-up.
  const RET_WEEKS = [1, 2, 4, 8];
  const byWeek = new Map<number, Person[]>();
  for (const p of accounts) {
    const signup = p.first.signup as number;
    if (signup < opts.from || signup > opts.to) continue;
    const weekStart = Math.floor((dayNumber(signup) + 3) / 7); // Monday-based week number
    byWeek.set(weekStart, [...(byWeek.get(weekStart) ?? []), p]);
  }
  const retention = [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekNo, members]) => {
      const weekStartTs = (weekNo * 7 - 3) * DAY;
      const weeks = RET_WEEKS.map((n) => {
        // Only score a week once EVERY member has had the chance to finish it.
        const lastSignup = Math.max(...members.map((p) => p.first.signup as number));
        if (lastSignup + (n * 7 + 7) * DAY > now) return null;
        const came = members.filter((p) => {
          const d0 = dayNumber(p.first.signup as number);
          for (const d of p.useDays) if (d - d0 >= n * 7 && d - d0 < n * 7 + 7) return true;
          return false;
        }).length;
        return pct(came, members.length);
      });
      return { week: new Date(weekStartTs).toISOString().slice(0, 10), signedUp: members.length, weeks };
    });

  // --- What comes before paying ---
  const LOOKBACK_DAYS = 14;
  const payers = accounts.concat(all.filter((p) => p.first.signup === undefined && p.first.paid !== undefined)).filter((p) => p.first.paid !== undefined);
  const nonPayers = accounts.filter((p) => p.first.paid === undefined);
  const payerDid = new Map<string, number>();
  const nonPayerDid = new Map<string, number>();
  const useDaysBefore: number[] = [];
  for (const p of payers) {
    const paidAt = p.first.paid as number;
    const names = new Set(
      p.events.filter((e) => e.ts < paidAt && e.ts >= paidAt - LOOKBACK_DAYS * DAY && e.stage !== 'paid').map((e) => e.event),
    );
    for (const n of names) payerDid.set(n, (payerDid.get(n) ?? 0) + 1);
    useDaysBefore.push(new Set(p.events.filter((e) => e.stage === 'use' && e.ts < paidAt).map((e) => dayNumber(e.ts))).size);
  }
  for (const p of nonPayers) {
    for (const n of new Set(p.events.map((e) => e.event))) nonPayerDid.set(n, (nonPayerDid.get(n) ?? 0) + 1);
  }
  const actions = [...payerDid.entries()]
    .map(([event, n]) => {
      const payersPct = pct(n, payers.length) ?? 0;
      const nonPayersPct = pct(nonPayerDid.get(event) ?? 0, nonPayers.length) ?? 0;
      return { event, payersPct, nonPayersPct, lift: nonPayersPct > 0 ? Math.round((payersPct / nonPayersPct) * 10) / 10 : null };
    })
    .sort((a, b) => b.payersPct - a.payersPct || a.event.localeCompare(b.event))
    .slice(0, 12);

  // --- What the move to paying looks like (payments inside the window) ---
  const windowPayers = payers.filter((p) => (p.first.paid as number) >= opts.from && (p.first.paid as number) <= opts.to);
  const signupToPaid: number[] = [];
  const useToPaid: number[] = [];
  const planRows = new Map<string, { payers: number; revenueCents: number }>();
  const cohortRows = new Map<string, number>();
  let payments = 0;
  let revenueCents = 0;
  let repeatPayers = 0;
  for (const p of windowPayers) {
    const m = milestones(p, product);
    const paidAt = p.first.paid as number;
    if (m.signup !== undefined && m.signup <= paidAt) signupToPaid.push((paidAt - m.signup) / DAY);
    if (m.activate !== undefined && m.activate <= paidAt) useToPaid.push((paidAt - m.activate) / DAY);
    const inWindow = p.payments.filter((x) => x.ts >= opts.from && x.ts <= opts.to);
    payments += inWindow.length;
    if (p.payments.length > 1) repeatPayers++;
    const plan = p.payments[0]?.plan || 'unknown';
    const row = planRows.get(plan) ?? { payers: 0, revenueCents: 0 };
    row.payers++;
    for (const x of inWindow) {
      revenueCents += x.cents;
      row.revenueCents += x.cents;
    }
    planRows.set(plan, row);
    const c = p.cohort || 'not set';
    cohortRows.set(c, (cohortRows.get(c) ?? 0) + 1);
  }
  const checkoutAbandoned = all.filter(
    (p) => p.first.checkout !== undefined && p.first.checkout >= opts.from && p.first.checkout <= opts.to && !p.payments.some((x) => x.ts >= (p.first.checkout as number)),
  ).length;

  const applicableStages = [...new Set<string>([...GET_IN_LADDER, ...PAY_LADDER, 'churn'])].filter((s) => !product.notApplicable.includes(s));
  const notReported = applicableStages.filter((s) => {
    if (s === 'return') return !stagesSeen.has('use');
    if (s === 'activate') return product.activation === 'explicit' ? !stagesSeen.has('activate') : !stagesSeen.has('use') && !stagesSeen.has('activate');
    return !stagesSeen.has(s);
  });

  const lastTs = usable.length ? Math.max(...usable.map((e) => e.ts)) : null;
  return {
    product: { slug: product.slug, name: product.name, quietDays: product.quietDays, activationMeans: product.activationMeans, paidMeans: product.paidMeans },
    window: { from: new Date(opts.from).toISOString(), to: new Date(opts.to).toISOString(), days: Math.round((opts.to - opts.from) / DAY) },
    generatedAt: new Date(now).toISOString(),
    totals: { events: usable.length, people: all.length, eventsWithoutId: withoutId, lastEventAt: lastTs ? new Date(lastTs).toISOString() : null },
    getIn,
    pay,
    bySource,
    lastStepBeforeLeaving: top(leftAfter, 8),
    stopping: {
      signedUp: accounts.length,
      active,
      quiet,
      neverUsed,
      cancelled,
      lastedBuckets: bucketList(lasted),
      lastThingBeforeQuiet: top(lastBeforeQuiet, 8),
      retention,
    },
    beforePaying: { payers: payers.length, nonPayers: nonPayers.length, lookbackDays: LOOKBACK_DAYS, actions, medianUseDaysBeforePaying: median(useDaysBefore) },
    movingToPaid: {
      payers: windowPayers.length,
      payments,
      revenueCents,
      medianDaysSignupToPaid: round1(median(signupToPaid)),
      medianDaysFirstUseToPaid: round1(median(useToPaid)),
      daysToPayBuckets: bucketList(signupToPaid),
      plans: [...planRows.entries()].map(([plan, r]) => ({ plan, ...r })).sort((a, b) => b.payers - a.payers),
      cohorts: [...cohortRows.entries()].map(([c, n]) => ({ cohort: c, payers: n })).sort((a, b) => b.payers - a.payers),
      repeatPayers,
      checkoutAbandoned,
    },
    notReported,
  };
}
