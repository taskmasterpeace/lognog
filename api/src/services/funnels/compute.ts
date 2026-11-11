/**
 * Funnel maths. Pure functions over a list of funnel events, so the same code
 * runs (and is tested) on ClickHouse and on SQLite.
 *
 * The rules, in plain words (docs/FUNNELS.md has the long version):
 *  - A person is one `user_id`. Before sign-up they are an `anon_id`; the first
 *    event that carries both ties the two together for good.
 *  - "First real use" = the product's `activate` event, or the first `use`.
 *  - "Came back" = a `use` on a later calendar day (UTC) than the first real
 *    use, and at least 12 hours after it.
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
  product: { slug: string; name: string; quietDays: number; activationMeans: string; paidMeans: string; notApplicable: string[] };
  window: { from: string; to: string; days: number };
  generatedAt: string;
  totals: { events: number; people: number; eventsWithoutId: number; lastEventAt: string | null; /** Older accounts seen coming back with no sign-up in view; kept off the new-people ladders. */ olderAccounts: number };
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
    /** Accounts too new to judge that have not used it yet. Counted inside `active`. */
    newNotUsedYet: number;
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
    /** Payments in the range that came with no amount (old log lines read through a bridge rule). */
    paymentsWithoutAmount: number;
    revenueCents: number;
    medianDaysSignupToPaid: number | null;
    medianDaysFirstUseToPaid: number | null;
    daysToPayBuckets: Array<{ label: string; people: number }>;
    plans: Array<{ plan: string; payers: number; payments: number; paymentsWithoutAmount: number; revenueCents: number }>;
    cohorts: Array<{ cohort: string; payers: number }>;
    repeatPayers: number;
    checkoutAbandoned: number;
  };
  notReported: string[];
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** A second use only counts as "came back" this long after the first (so one late evening is not two visits). */
const RETURN_GAP = 12 * HOUR;
/** A checkout younger than this is still in progress, not abandoned. */
const CHECKOUT_GRACE = HOUR;

/** Largest value of a list; safe for very long lists (no argument spreading). */
function maxOf(values: number[]): number {
  let m = -Infinity;
  for (const v of values) if (v > m) m = v;
  return m;
}

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
  payments: Array<{ ts: number; cents: number; hasAmount: boolean; plan?: string; renewal: boolean }>;
  /** First payment that is not a renewal. A person with only renewals is an older customer, not a new payer. */
  firstNewPaid?: number;
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
      const dedupe = `${key}|${e.stage}|${e.eventId}`;
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
    if (e.stage === 'paid') {
      const renewal = /renew/.test(e.event);
      p.payments.push({ ts: e.ts, cents: e.amountCents ?? 0, hasAmount: e.amountCents !== undefined, plan: e.plan, renewal });
      if (!renewal && p.firstNewPaid === undefined) p.firstNewPaid = e.ts;
    }
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
      if (e.stage === 'use' && dayNumber(e.ts) > d0 && e.ts - activate >= RETURN_GAP) {
        returned = e.ts;
        break;
      }
    }
  }
  let lastUse: number | undefined;
  let lastChurn: number | undefined;
  for (const e of p.events) {
    if ((e.stage === 'use' || e.stage === 'activate') && (lastUse === undefined || e.ts > lastUse)) lastUse = e.ts;
    if (e.stage === 'churn' && (lastChurn === undefined || e.ts > lastChurn)) lastChurn = e.ts;
  }
  return {
    visit: p.first.visit,
    signup_start: p.first.signup_start,
    signup: p.first.signup,
    activate,
    return: returned,
    paywall: p.first.paywall,
    checkout: p.first.checkout,
    // A renewal on its own is an older customer paying again, not someone becoming a payer.
    paid: p.firstNewPaid,
    churn: p.first.churn,
    lastUse,
    lastChurn,
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

  // An account we never saw being created: it has an account id, and there is no
  // sign-up event for it anywhere in view. That is an older customer coming back
  // (landing logged out and signing in after months away, say), not a new person,
  // so it must not sit on the ladders as "visited, never signed up" or as a new
  // sign-up. Only applied when the product reports sign-ups at all; otherwise
  // every account would look like this. The cost: a new person whose sign-up line
  // was lost is also kept off the ladders rather than guessed onto them.
  const signupReported = all.some((p) => p.first.signup !== undefined);
  const isOlderAccount = (p: Person): boolean => signupReported && p.isUser && p.first.signup === undefined;
  const olderAccounts = all.filter(isOlderAccount);

  // --- Ladders: NEW people first seen inside the window, and how far they have got since. ---
  const cohort = all.filter((p) => p.firstTs >= opts.from && p.firstTs <= opts.to && !isOlderAccount(p));
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
  // Everyone with an account: sign-ups we saw, plus older accounts (their start is the first time we saw them).
  const accounts = all.filter((p) => p.first.signup !== undefined || isOlderAccount(p));
  const startOf = (p: Person): number => p.first.signup ?? p.firstTs;
  let active = 0;
  let quiet = 0;
  let neverUsed = 0;
  let newNotUsedYet = 0;
  let cancelled = 0;
  const lasted: number[] = [];
  const lastBeforeQuiet = new Map<string, number>();
  for (const p of accounts) {
    const m = milestones(p, product);
    // Cancelled = their latest cancellation is newer than their latest payment.
    if (m.lastChurn !== undefined && !p.payments.some((x) => x.ts > (m.lastChurn as number))) cancelled++;
    if (m.lastUse === undefined) {
      if (p.first.signup === undefined) {
        // An older account with no use in view. We do not know its history, so it
        // is never "new" or "never used": it is active if we saw it lately, quiet if not.
        if (now - p.events[p.events.length - 1].ts > quietMs) quiet++;
        else active++;
        continue;
      }
      // Give brand-new accounts the quiet window before calling them lost.
      if (now - startOf(p) > quietMs) neverUsed++;
      else {
        active++;
        newNotUsedYet++;
      }
      continue;
    }
    if (now - m.lastUse > quietMs) {
      quiet++;
      // "How long they lasted" runs from sign-up, so only for accounts whose sign-up we saw.
      if (p.first.signup !== undefined) lasted.push(Math.max(0, (m.lastUse - p.first.signup) / DAY));
      const last = [...p.events].reverse().find((e) => e.stage === 'use' || e.stage === 'activate');
      if (last) lastBeforeQuiet.set(last.event, (lastBeforeQuiet.get(last.event) ?? 0) + 1);
    } else active++;
  }

  // Weekly retention by sign-up week. Week N = days 7N..7N+6 after sign-up.
  const RET_WEEKS = [1, 2, 4, 8];
  const byWeek = new Map<number, Person[]>();
  for (const p of accounts) {
    // Retention is by the week of a sign-up we actually saw.
    if (p.first.signup === undefined) continue;
    const signup = p.first.signup;
    if (signup < opts.from || signup > opts.to) continue;
    const weekStart = Math.floor((dayNumber(signup) + 3) / 7); // Monday-based week number
    const members = byWeek.get(weekStart);
    if (members) members.push(p);
    else byWeek.set(weekStart, [p]);
  }
  const retention = [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekNo, members]) => {
      const weekStartTs = (weekNo * 7 - 3) * DAY;
      const weeks = RET_WEEKS.map((n) => {
        // Only score a week once EVERY member has had the chance to finish it.
        const lastSignup = maxOf(members.map((p) => p.first.signup as number));
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
  // Things done inside the product. Ladder steps (visit, sign-up, checkout) are
  // left out: every payer started a checkout, which says nothing.
  const IN_PRODUCT = new Set<string>(['use', 'activate', 'paywall']);
  const payers = accounts.concat(all.filter((p) => p.first.signup === undefined && !isOlderAccount(p) && p.first.paid !== undefined)).filter((p) => p.first.paid !== undefined);
  const nonPayers = accounts.filter((p) => p.first.paid === undefined);
  const payerDid = new Map<string, number>();
  const nonPayerDid = new Map<string, number>();
  const useDaysBefore: number[] = [];
  for (const p of payers) {
    const paidAt = p.first.paid as number;
    const names = new Set(
      p.events.filter((e) => e.ts < paidAt && e.ts >= paidAt - LOOKBACK_DAYS * DAY && IN_PRODUCT.has(e.stage)).map((e) => e.event),
    );
    for (const n of names) payerDid.set(n, (payerDid.get(n) ?? 0) + 1);
    useDaysBefore.push(new Set(p.events.filter((e) => e.stage === 'use' && e.ts < paidAt).map((e) => dayNumber(e.ts))).size);
  }
  for (const p of nonPayers) {
    for (const n of new Set(p.events.filter((e) => IN_PRODUCT.has(e.stage)).map((e) => e.event))) nonPayerDid.set(n, (nonPayerDid.get(n) ?? 0) + 1);
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
  // New payers: first payment in the range, and that payment is not a renewal.
  const windowPayers = payers.filter((p) => p.firstNewPaid !== undefined && p.firstNewPaid === p.first.paid && p.firstNewPaid >= opts.from && p.firstNewPaid <= opts.to);
  const signupToPaid: number[] = [];
  const useToPaid: number[] = [];
  const cohortRows = new Map<string, number>();
  let repeatPayers = 0;
  for (const p of windowPayers) {
    const m = milestones(p, product);
    const paidAt = p.first.paid as number;
    if (m.signup !== undefined && m.signup <= paidAt) signupToPaid.push((paidAt - m.signup) / DAY);
    if (m.activate !== undefined && m.activate <= paidAt) useToPaid.push((paidAt - m.activate) / DAY);
    if (p.payments.length > 1) repeatPayers++;
    const c = p.cohort || 'not set';
    cohortRows.set(c, (cohortRows.get(c) ?? 0) + 1);
  }
  // Money in = EVERY payment in the range, renewals from older customers included.
  const planRows = new Map<string, { payers: number; payments: number; paymentsWithoutAmount: number; revenueCents: number }>();
  let payments = 0;
  let paymentsWithoutAmount = 0;
  let revenueCents = 0;
  for (const p of all) {
    const plansPaid = new Set<string>();
    for (const x of p.payments) {
      if (x.ts < opts.from || x.ts > opts.to) continue;
      payments++;
      if (!x.hasAmount) paymentsWithoutAmount++;
      revenueCents += x.cents;
      const plan = x.plan || 'unknown';
      const row = planRows.get(plan) ?? { payers: 0, payments: 0, paymentsWithoutAmount: 0, revenueCents: 0 };
      row.payments++;
      if (!x.hasAmount) row.paymentsWithoutAmount++;
      row.revenueCents += x.cents;
      if (!plansPaid.has(plan)) {
        plansPaid.add(plan);
        row.payers++;
      }
      planRows.set(plan, row);
    }
  }
  const checkoutAbandoned = all.filter(
    (p) =>
      p.first.checkout !== undefined &&
      p.first.checkout >= opts.from &&
      p.first.checkout <= opts.to &&
      now - p.first.checkout > CHECKOUT_GRACE &&
      !p.payments.some((x) => x.ts >= (p.first.checkout as number)),
  ).length;

  const applicableStages = [...new Set<string>([...GET_IN_LADDER, ...PAY_LADDER, 'churn'])].filter((s) => !product.notApplicable.includes(s));
  const notReported = applicableStages.filter((s) => {
    if (s === 'return') return !stagesSeen.has('use');
    if (s === 'activate') return product.activation === 'explicit' ? !stagesSeen.has('activate') : !stagesSeen.has('use') && !stagesSeen.has('activate');
    return !stagesSeen.has(s);
  });

  const lastTs = usable.length ? maxOf(usable.map((e) => e.ts)) : null;
  return {
    product: { slug: product.slug, name: product.name, quietDays: product.quietDays, activationMeans: product.activationMeans, paidMeans: product.paidMeans, notApplicable: product.notApplicable },
    window: { from: new Date(opts.from).toISOString(), to: new Date(opts.to).toISOString(), days: Math.round((opts.to - opts.from) / DAY) },
    generatedAt: new Date(now).toISOString(),
    totals: { events: usable.length, people: all.length, eventsWithoutId: withoutId, lastEventAt: lastTs ? new Date(lastTs).toISOString() : null, olderAccounts: olderAccounts.length },
    getIn,
    pay,
    bySource,
    lastStepBeforeLeaving: top(leftAfter, 8),
    stopping: {
      signedUp: accounts.length,
      active,
      quiet,
      neverUsed,
      newNotUsedYet,
      cancelled,
      lastedBuckets: bucketList(lasted),
      lastThingBeforeQuiet: top(lastBeforeQuiet, 8),
      retention,
    },
    beforePaying: { payers: payers.length, nonPayers: nonPayers.length, lookbackDays: LOOKBACK_DAYS, actions, medianUseDaysBeforePaying: median(useDaysBefore) },
    movingToPaid: {
      payers: windowPayers.length,
      payments,
      paymentsWithoutAmount,
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
