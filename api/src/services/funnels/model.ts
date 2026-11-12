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
  /** Wording for the product's nightly health block (services/funnels/health.ts). Products without it have no block. */
  health?: {
    /** One `use` event, as a thing done: "sheet read". */
    unitOneRead: string;
    /** Many of them: "sheets read". */
    unitPlural: string;
    /** Short plural noun: "sheets". */
    unitShort: string;
    personOne: string;
    peoplePlural: string;
    /** How many uses count as "getting hooked". */
    hookedAt: number;
    /** Honest limits shown under the block. */
    notes: string[];
  };
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
      // Only a refused charge is a paywall; a zero-point bonus line with the same status is not.
      { match: 'credit_event', where: { status: 'insufficient', action: 'deduct' }, stage: 'paywall', event: 'out_of_points' },
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
    activationMeans: 'First sheet read on the family account',
    paidMeans: 'Family plan payment',
    notApplicable: [],
    strictPrivacy: true,
    health: {
      unitOneRead: 'sheet read',
      unitPlural: 'sheets read',
      unitShort: 'sheets',
      personOne: 'family',
      peoplePlural: 'families',
      hookedAt: 3,
      notes: [
        'A family is one parent account. Nothing about a child is collected.',
        'Quizzes, rounds and games run on the family\'s own device and are never reported, so they are not counted here.',
        'Website only: sheets read inside the iPhone app are not counted per family.',
        'Only successful sheet reads are reported so far, so there is no good-read rate yet.',
      ],
    },
  },
];

export function findFunnelProduct(slugOrIndex: string): FunnelProduct | undefined {
  const v = String(slugOrIndex || '').toLowerCase();
  return FUNNEL_PRODUCTS.find((p) => p.slug === v || p.indexes.includes(v));
}

// ---------------------------------------------------------------------------
// Ingest-time tidy-up
// ---------------------------------------------------------------------------

/** Fields a funnel event may carry. Anything else is left alone on normal products; strict ones are rebuilt from this list (buildStrictEvent). */
export const FUNNEL_FIELDS = [
  'funnel_v', 'funnel_stage', 'funnel_event', 'product', 'surface', 'env',
  'anon_id', 'user_id', 'session_id', 'event_id',
  'utm_source', 'utm_medium', 'utm_campaign', 'referrer_host', 'landing_path',
  'cohort', 'plan', 'interval', 'amount_cents', 'currency', 'props',
  'timestamp', 'message', 'level', 'hostname', 'app_name',
] as const;

/** Never stored for a strict (kids/family) product, and never allowed inside `props` for any product. */
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
    if (!PROP_KEY.test(k) || PII_KEYS.has(k) || UNSAFE_KEYS.has(k)) continue;
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
    if (rule.where && !Object.entries(rule.where).every(([k, v]) => event[k] === v)) continue;
    const out: Record<string, unknown> = { ...event, funnel_v: FUNNEL_VERSION, funnel_stage: rule.stage, funnel_event: rule.event, funnel_legacy: 1 };
    if (!out.product) out.product = product.slug;
    for (const [std, old] of Object.entries(rule.copy ?? {})) {
      if (out[std] === undefined && event[old] !== undefined) out[std] = event[old];
    }
    return out;
  }
  return event;
}

const TOKEN_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'referrer_host', 'landing_path',
  'cohort', 'plan', 'interval', 'currency', 'surface', 'env',
] as const;
const ID_KEYS = ['anon_id', 'user_id', 'session_id', 'event_id'] as const;
/** Keys that could reach an object's prototype; never copied. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/** A time, written the standard way. Nothing else is accepted as a timestamp on a strict product. */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?$/;

/** An id is an opaque token: a string or number, no spaces, no "@", not too long. */
function cleanId(raw: unknown): string | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const id = String(raw);
  if (id === '' || id.length > 128 || id.includes('@') || /\s/.test(id)) return undefined;
  return id;
}

function cleanCents(raw: unknown): number | undefined {
  if (typeof raw !== 'number' && typeof raw !== 'string') return undefined;
  if (raw === '') return undefined;
  const cents = Math.round(Number(raw));
  return Number.isFinite(cents) && cents >= 0 ? cents : undefined;
}

function cleanVersion(raw: unknown): number {
  const v = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isInteger(v) && v > 0 && v < 1000 ? v : FUNNEL_VERSION;
}

function cleanEventName(raw: unknown, fallback: string): string {
  const name = typeof raw === 'string' ? raw.toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_') : '';
  return EVENT_NAME.test(name) ? name : fallback;
}

/**
 * Strict (kids/family) products: the stored line is BUILT from the allowlist,
 * field by field, each value checked for its kind. Nothing is copied across
 * by default, so a field this function does not know about cannot survive.
 */
function buildStrictEvent(event: Record<string, unknown>, product: FunnelProduct, stage: SentStage | null): Record<string, unknown> {
  const out: Record<string, unknown> = { product: product.slug, funnel_v: cleanVersion(event.funnel_v), level: 'info' };

  const ts = event.timestamp;
  // Epoch seconds or milliseconds in a sane range (2001 to 2286); anything else is dropped.
  if (typeof ts === 'number' && Number.isFinite(ts) && ts >= 1e9 && ts < 1e13) out.timestamp = ts;
  else if (typeof ts === 'string' && ts.length <= 40 && ISO_TIME.test(ts) && Number.isFinite(Date.parse(ts))) out.timestamp = ts;

  for (const key of ID_KEYS) {
    const id = cleanId(event[key]);
    if (id) out[key] = id;
  }
  for (const key of TOKEN_KEYS) {
    const v = event[key];
    if (typeof v === 'string' && SAFE_TOKEN.test(v)) out[key] = v;
  }
  const cents = cleanCents(event.amount_cents);
  if (cents !== undefined) out.amount_cents = cents;
  const props = cleanProps(event.props, true);
  if (props) out.props = props;

  if (stage === null) {
    out.funnel_error = 'unknown stage';
    out.message = 'funnel unknown stage';
    return out;
  }
  out.funnel_stage = stage;
  // The name must already be a code as sent. Text is never squeezed into one here
  // ("Timmy Smith failed math" must not become timmy_smith_failed_math).
  out.funnel_event = typeof event.funnel_event === 'string' && EVENT_NAME.test(event.funnel_event) ? event.funnel_event : stage;
  out.message = `funnel ${stage} ${out.funnel_event}`;
  return out;
}

/**
 * Other products mark lines their dashboards already read, so the line's other
 * fields are left as they were; only the funnel fields are checked.
 */
function tidyOpenEvent(event: Record<string, unknown>, product: FunnelProduct, stage: SentStage | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event)) {
    if (UNSAFE_KEYS.has(k)) continue;
    out[k] = v;
  }
  for (const key of ID_KEYS) {
    if (!(key in out)) continue;
    const id = cleanId(out[key]);
    if (id) out[key] = id;
    else delete out[key];
  }
  if ('amount_cents' in out) {
    const cents = cleanCents(out.amount_cents);
    if (cents !== undefined) out.amount_cents = cents;
    else delete out.amount_cents;
  }
  const props = cleanProps(event.props, false);
  if (props) out.props = props;
  else delete out.props;
  if (typeof out.product !== 'string' || !out.product) out.product = product.slug;

  if (stage === null) {
    // Keep the line (so it shows up when someone searches), but it must not count.
    delete out.funnel_stage;
    delete out.funnel_event;
    const said = typeof event.funnel_stage === 'string' ? event.funnel_stage.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 40) : '';
    out.funnel_error = `unknown stage "${said}"`;
    return out;
  }
  out.funnel_stage = stage;
  out.funnel_v = cleanVersion(event.funnel_v);
  out.funnel_event = cleanEventName(event.funnel_event, stage);
  return out;
}

/**
 * Called for every event on POST /ingest/http, before it is stored.
 *
 * - A line is only touched when it LANDS IN a declared product's index. A line
 *   in any other index comes back as the same object, whatever it contains.
 *   The one exception leans the safe way: a line that names a strict (kids)
 *   product is cut to the allowlist wherever it lands.
 * - An event with `funnel_stage` is checked: bad stage names are flagged, ids
 *   and amounts are checked, strict products are rebuilt from the allowlist.
 * - An old-style event that matches a product's bridge rule gets funnel fields
 *   ADDED; nothing is removed from it, so whatever reads those lines today
 *   keeps working. Strict products have no bridge rules.
 * - Everything else is returned untouched (same object).
 *
 * It never throws. If a strict product's event cannot be read at all, a bare
 * stub is stored in its place rather than the original.
 */
export function normalizeFunnelEvent(event: Record<string, unknown>, indexName: string): Record<string, unknown> {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return event;
  // Where the event LANDS decides the product, and that is settled before any
  // field of the event is read, so nothing the event does can undo it.
  const byIndex = findFunnelProduct(indexName);
  let strictProduct: FunnelProduct | undefined = byIndex?.strictPrivacy ? byIndex : undefined;
  try {
    // The event's own `product` field can only make the rules stricter, never looser.
    const named = typeof event.product === 'string' ? findFunnelProduct(event.product) : undefined;
    if (!strictProduct && named?.strictPrivacy) strictProduct = named;
    if (!byIndex && !strictProduct) return event;

    const hasStage = Object.prototype.hasOwnProperty.call(event, 'funnel_stage') && event.funnel_stage !== undefined;
    if (!hasStage) {
      // Bridge rules only run for the product whose index this is.
      return byIndex && !strictProduct ? applyLegacyRules(event, byIndex) : event;
    }
    const stageText = typeof event.funnel_stage === 'string' ? event.funnel_stage.toLowerCase().trim() : '';
    const stage = isSentStage(stageText) ? stageText : null;
    if (strictProduct) return buildStrictEvent(event, strictProduct, stage);
    return tidyOpenEvent(event, byIndex as FunnelProduct, stage);
  } catch {
    if (strictProduct) {
      return { product: strictProduct.slug, level: 'warn', message: 'funnel event dropped', funnel_error: 'could not be read' };
    }
    return event;
  }
}
