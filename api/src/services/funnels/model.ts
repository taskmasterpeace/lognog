/**
 * The shared funnel language (docs/FUNNELS.md is the plain-English spec).
 *
 * Every product sends the same small set of stage names on ordinary log events;
 * LogNog works out activation, repeat use, quiet users and drop-off from them.
 */

export const FUNNEL_VERSION = 1;

/** Stage names a product may SEND. */
export const SENT_STAGES = [
  'visit', // someone landed on a public page
  'signup_start', // they opened or began the sign-up form
  'signup', // an account now exists
  'activate', // optional: the product's own "got real value" moment
  'use', // one real use of the core feature (send it every time)
  'paywall', // they were shown a price or hit a free limit
  'checkout', // they started to pay
  'paid', // money arrived (confirmed by the payment provider)
  'churn', // they cancelled, or a payment lapsed
] as const;
export type SentStage = (typeof SENT_STAGES)[number];

/** Stages LogNog DERIVES; products never send these. */
export const DERIVED_STAGES = ['return', 'quiet'] as const;

export function isSentStage(v: unknown): v is SentStage {
  return typeof v === 'string' && (SENT_STAGES as readonly string[]).includes(v);
}

/** The two ladders every product is read against. */
export const GET_IN_LADDER = ['visit', 'signup_start', 'signup', 'activate', 'return'] as const;
export const PAY_LADDER = ['signup', 'paywall', 'checkout', 'paid'] as const;
export type LadderStage = (typeof GET_IN_LADDER)[number] | (typeof PAY_LADDER)[number];

export const STAGE_LABELS: Record<string, string> = {
  visit: 'Visited',
  signup_start: 'Started sign-up',
  signup: 'Signed up',
  activate: 'First real use',
  use: 'Used it',
  return: 'Came back',
  paywall: 'Saw the price',
  checkout: 'Started checkout',
  paid: 'Paid',
  churn: 'Cancelled',
  quiet: 'Went quiet',
};

/** A rule that reads an OLD log line as a funnel step (bridge until the product sends real ones). */
export interface LegacyRule {
  /** Matches when `message` or `event` equals this (or starts with it when `prefix` is set). */
  match: string;
  prefix?: boolean;
  /** Extra exact-match conditions on other fields. */
  where?: Record<string, string>;
  stage: SentStage;
  event: string;
  /** Copy old field names onto the standard ones: { standardName: oldName }. */
  copy?: Record<string, string>;
}

export interface FunnelProduct {
  /** Stable id, also the default LogNog index. */
  slug: string;
  name: string;
  /** Indexes this product's events land in. */
  indexes: string[];
  /** Days with no real use before a signed-up person counts as "went quiet". */
  quietDays: number;
  /** 'first_use' = first `use` event; 'explicit' = the product sends `activate` itself. */
  activation: 'first_use' | 'explicit';
  /** One line: what "first real use" means for this product. */
  activationMeans: string;
  /** One line: what "paid" means for this product. */
  paidMeans: string;
  /** Stages that do not exist for this product (shown as "does not apply", never as 0%). */
  notApplicable: string[];
  /** Kids/family product: only allowlisted fields are kept, nothing free-text. */
  strictPrivacy?: boolean;
  legacyRules?: LegacyRule[];
}

export const FUNNEL_PRODUCTS: FunnelProduct[] = [
  {
    slug: 'directors-palette',
    name: 'Directors Palette',
    indexes: ['directors-palette'],
    quietDays: 30,
    activation: 'first_use',
    activationMeans: 'First finished image or video generation',
    paidMeans: 'Bought a points pack (one-time; there is no subscription)',
    notApplicable: ['churn'],
    legacyRules: [
      { match: 'User signup completed', stage: 'signup', event: 'signup_completed' },
      { match: 'generation_completed', stage: 'use', event: 'generation_completed' },
      { match: 'credit_event', where: { status: 'insufficient' }, stage: 'paywall', event: 'out_of_points' },
      { match: 'checkout_session_created', stage: 'checkout', event: 'checkout_started', copy: { user_id: 'userId', plan: 'packageName' } },
      {
        match: 'payment_completed',
        stage: 'paid',
        event: 'points_purchased',
        copy: { event_id: 'stripe_session_id', plan: 'package_name' },
      },
    ],
  },
  {
    slug: 'hey-youre-hired',
    name: "Hey You're Hired",
    indexes: ['hey-youre-hired'],
    quietDays: 14,
    activation: 'explicit',
    activationMeans: 'Profile at least half complete and first Smart Jobs run',
    paidMeans: 'Subscription payment (weekly or monthly)',
    notApplicable: [],
    legacyRules: [
      { match: 'User signup', stage: 'signup', event: 'signup_completed' },
      { match: 'User activated', stage: 'activate', event: 'activated' },
      { match: 'Feature completed:', prefix: true, stage: 'use', event: 'feature_completed' },
      { match: 'Checkout started', stage: 'checkout', event: 'checkout_started', copy: { plan: 'plan_selected' } },
      { match: 'Payment conversion tracked', stage: 'paid', event: 'subscription_paid' },
      { match: 'Subscription synced', where: { status: 'canceled' }, stage: 'churn', event: 'subscription_cancelled', copy: { plan: 'plan_name' } },
    ],
  },
  {
    slug: 'homework-tree',
    name: 'Homework Tree',
    indexes: ['homework-tree', 'knowledge-league'],
    quietDays: 14,
    activation: 'first_use',
    activationMeans: 'First homework session finished on the family account',
    paidMeans: 'Family plan payment',
    notApplicable: [],
    strictPrivacy: true,
  },
];

export function findFunnelProduct(slugOrIndex: string): FunnelProduct | undefined {
  const v = String(slugOrIndex || '').toLowerCase();
  return FUNNEL_PRODUCTS.find((p) => p.slug === v || p.indexes.includes(v));
}

// ---------------------------------------------------------------------------
// Ingest-time tidy-up
// ---------------------------------------------------------------------------

/** Fields a funnel event may carry. Anything else is left alone on normal products, dropped on strict ones. */
export const FUNNEL_FIELDS = [
  'funnel_v', 'funnel_stage', 'funnel_event', 'product', 'surface', 'env',
  'anon_id', 'user_id', 'session_id', 'event_id',
  'utm_source', 'utm_medium', 'utm_campaign', 'referrer_host', 'landing_path',
  'cohort', 'plan', 'interval', 'amount_cents', 'currency', 'props',
  'timestamp', 'message', 'level', 'hostname', 'app_name',
] as const;

/** Never stored on a funnel event, whichever product sent it. */
const PII_KEYS = new Set([
  'user_email', 'email', 'user_name', 'name', 'full_name', 'first_name', 'last_name',
  'ip', 'ip_address', 'user_agent', 'phone', 'address',
  'child_id', 'child_name', 'student_id', 'student_name', 'kid_id', 'kid_name',
]);

const EVENT_NAME = /^[a-z][a-z0-9_]{1,47}$/;
const PROP_KEY = /^[a-z][a-z0-9_]{0,31}$/;
const SAFE_TOKEN = /^[A-Za-z0-9_.:\-/]{1,64}$/;

function cleanProps(input: unknown, strict: boolean): Record<string, string | number | boolean> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  let n = 0;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (n >= 20) break;
    if (!PROP_KEY.test(k) || PII_KEYS.has(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') {
      // Strict products: short code-like values only (no sentences, no emails).
      if (strict ? SAFE_TOKEN.test(v) && !v.includes('@') : v.length <= 120 && !v.includes('@')) out[k] = v;
      else continue;
    } else continue;
    n++;
  }
  return n > 0 ? out : undefined;
}

function applyLegacyRules(event: Record<string, unknown>, product: FunnelProduct): Record<string, unknown> {
  const rules = product.legacyRules;
  if (!rules || rules.length === 0) return event;
  const message = typeof event.message === 'string' ? event.message : '';
  const name = typeof event.event === 'string' ? event.event : '';
  for (const rule of rules) {
    const hit = (v: string) => (rule.prefix ? v.startsWith(rule.match) : v === rule.match);
    if (!hit(message) && !hit(name)) continue;
    if (rule.where && !Object.entries(rule.where).every(([k, v]) => String(event[k] ?? '') === v)) continue;
    const out: Record<string, unknown> = { ...event, funnel_v: FUNNEL_VERSION, funnel_stage: rule.stage, funnel_event: rule.event, funnel_legacy: 1 };
    if (!out.product) out.product = product.slug;
    for (const [std, old] of Object.entries(rule.copy ?? {})) {
      if (out[std] === undefined && event[old] !== undefined) out[std] = event[old];
    }
    return out;
  }
  return event;
}

const STRICT_TOKEN_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'referrer_host', 'landing_path',
  'cohort', 'plan', 'interval', 'currency', 'surface', 'env', 'hostname', 'app_name', 'level',
] as const;

/**
 * Clean one event that is being treated as a funnel step (or that tried to be
 * one). `stage` is the checked stage name, or null when the name was unknown.
 */
function cleanFunnelEvent(event: Record<string, unknown>, product: FunnelProduct, strict: boolean, stage: SentStage | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event)) {
    if (PII_KEYS.has(k)) continue;
    if (strict && !(FUNNEL_FIELDS as readonly string[]).includes(k)) continue;
    out[k] = v;
  }

  for (const idKey of ['anon_id', 'user_id', 'session_id', 'event_id'] as const) {
    const raw = out[idKey];
    // An id is an opaque token; an email, a sentence or an object is not an id.
    if ((typeof raw !== 'string' && typeof raw !== 'number') || raw === '') {
      delete out[idKey];
      continue;
    }
    const id = String(raw);
    if (id.length > 128 || id.includes('@') || /\s/.test(id)) delete out[idKey];
    else out[idKey] = id;
  }

  if (out.amount_cents !== undefined) {
    const cents = Math.round(Number(out.amount_cents));
    if (typeof out.amount_cents !== 'object' && Number.isFinite(cents) && cents >= 0) out.amount_cents = cents;
    else delete out.amount_cents;
  }

  const props = cleanProps(event.props, strict);
  if (props) out.props = props;
  else delete out.props;

  if (strict) {
    // The product is whatever the index says, never what the event claims.
    out.product = product.slug;
    for (const k of STRICT_TOKEN_KEYS) {
      if (out[k] !== undefined && !(typeof out[k] === 'string' && SAFE_TOKEN.test(out[k] as string))) delete out[k];
    }
    const ts = out.timestamp;
    const tsOk = (typeof ts === 'number' && Number.isFinite(ts)) || (typeof ts === 'string' && ts.length <= 40 && Number.isFinite(Date.parse(ts)));
    if (!tsOk) delete out.timestamp;
  } else if (typeof out.product !== 'string' || !out.product) {
    out.product = product.slug;
  }

  if (stage === null) {
    // Keep the line (so it shows up when someone searches), but it must not count.
    delete out.funnel_stage;
    delete out.funnel_event;
    const said = String(event.funnel_stage ?? '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 40);
    out.funnel_error = strict ? 'unknown stage' : `unknown stage "${said}"`;
    if (strict) out.message = 'funnel unknown stage';
    return out;
  }

  out.funnel_stage = stage;
  const version = Number(event.funnel_v);
  out.funnel_v = Number.isInteger(version) && version > 0 && version < 1000 ? version : FUNNEL_VERSION;
  const rawEvent = typeof event.funnel_event === 'string' ? event.funnel_event.toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_') : '';
  out.funnel_event = EVENT_NAME.test(rawEvent) ? rawEvent : stage;
  if (strict) out.message = `funnel ${stage} ${out.funnel_event}`;
  return out;
}

/**
 * Called for every event on POST /ingest/http, before it is stored.
 * - Only products in FUNNEL_PRODUCTS are touched: an event in any other index
 *   comes back as the same object, whatever fields it has.
 * - An event with `funnel_stage` is checked and tidied (bad stage names are
 *   flagged, personal fields removed, strict products cut to the allowlist).
 * - An old-style event that matches a product's bridge rule gets funnel fields
 *   ADDED; nothing is removed from it, so whatever reads those lines today
 *   keeps working.
 * - Everything else is returned untouched (same object).
 */
export function normalizeFunnelEvent(event: Record<string, unknown>, indexName: string): Record<string, unknown> {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return event;
  // Where the event LANDS decides the product. The event's own `product` field
  // can only make the rules stricter, never looser.
  const byIndex = findFunnelProduct(indexName);
  const byName = typeof event.product === 'string' ? findFunnelProduct(event.product) : undefined;
  const product = byIndex ?? byName;
  if (!product) return event;
  const strict = !!byIndex?.strictPrivacy || !!byName?.strictPrivacy;

  if (event.funnel_stage === undefined) {
    return applyLegacyRules(event, product);
  }
  const stage = typeof event.funnel_stage === 'string' ? event.funnel_stage.toLowerCase().trim() : '';
  return cleanFunnelEvent(event, product, strict, isSentStage(stage) ? stage : null);
}
