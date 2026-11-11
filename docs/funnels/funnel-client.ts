/**
 * Machine King Labs shared funnel client — v1.
 *
 * COPY THIS FILE into a product (do not edit the stage list; change only
 * PRODUCT below). The spec is docs/FUNNELS.md in the LogNog repo.
 *
 * It only BUILDS the event. Send the result through the product's existing
 * LogNog sender (same index, same key) as one ordinary log line.
 *
 * Rules that matter:
 *  - Stage names are fixed. Event names are yours: lower_snake_case, verb last
 *    (signup_completed, points_purchased, limit_hit).
 *  - `paid` and `churn` are sent by the SERVER only, from the payment
 *    provider's confirmed webhook, with `eventId` = the provider's id.
 *  - Never put an email, a name, an IP, free text, or anything about a child
 *    in any field. Ids are opaque tokens.
 */

export const FUNNEL_VERSION = 1;

export const FUNNEL_STAGES = [
  'visit',
  'signup_start',
  'signup',
  'activate',
  'use',
  'paywall',
  'checkout',
  'paid',
  'churn',
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/** Stages a browser may report. Everything else must come from server code. */
export const BROWSER_STAGES: readonly FunnelStage[] = ['visit', 'signup_start', 'paywall'];

export interface FunnelInput {
  stage: FunnelStage;
  /** lower_snake_case, e.g. "signup_completed". Defaults to the stage name. */
  event?: string;
  /** Random first-party id for someone with no account yet. */
  anonId?: string | null;
  /** The account id (for a family product: the PARENT account id, never a child's). */
  userId?: string | null;
  sessionId?: string | null;
  /** The payment provider's id (or any id that is the same on a retry), so a retry counts once. */
  eventId?: string | null;
  /** "web", "ios", "android", "extension"... */
  surface?: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  /** Host only ("google.com"), never a full URL. */
  referrerHost?: string | null;
  /** Path only ("/pricing"), never the query string. */
  landingPath?: string | null;
  /** How they first arrived: "organic", "invited_tester", "paid_ad"... Set once, at sign-up. */
  cohort?: string;
  plan?: string;
  /** "week" | "month" | "year" | "one_time" */
  interval?: string;
  amountCents?: number;
  currency?: string;
  /** Small extra facts: short code-like values only (numbers, true/false, "math", "k-2"). */
  props?: Record<string, string | number | boolean>;
}

const EVENT_NAME = /^[a-z][a-z0-9_]{1,47}$/;
const TOKEN = /^[A-Za-z0-9_.:\-/]{1,64}$/;
const PROP_KEY = /^[a-z][a-z0-9_]{0,31}$/;

function id(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const v = String(value);
  if (v.length > 128 || v.includes('@') || /\s/.test(v)) return undefined;
  return v;
}

function token(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const v = String(value).trim().slice(0, 64);
  return TOKEN.test(v) ? v : undefined;
}

export function isFunnelStage(value: unknown): value is FunnelStage {
  return typeof value === 'string' && (FUNNEL_STAGES as readonly string[]).includes(value);
}

/**
 * Build one funnel log line. Returns null when the input is not usable
 * (unknown stage, or nobody to attach it to) so callers can just skip it.
 */
export function buildFunnelEvent(
  product: string,
  input: FunnelInput,
  now: Date = new Date(),
): Record<string, unknown> | null {
  if (!isFunnelStage(input.stage)) return null;
  const anonId = id(input.anonId);
  const userId = id(input.userId);
  if (!anonId && !userId) return null;

  const rawEvent = (input.event ?? input.stage).toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_');
  const event = EVENT_NAME.test(rawEvent) ? rawEvent : input.stage;

  const out: Record<string, unknown> = {
    timestamp: now.toISOString(),
    level: 'info',
    message: `funnel ${input.stage} ${event}`,
    funnel_v: FUNNEL_VERSION,
    funnel_stage: input.stage,
    funnel_event: event,
    product,
    surface: token(input.surface) ?? 'web',
  };
  if (anonId) out.anon_id = anonId;
  if (userId) out.user_id = userId;
  const sessionId = id(input.sessionId);
  if (sessionId) out.session_id = sessionId;
  const eventId = id(input.eventId);
  if (eventId) out.event_id = eventId;

  const optional: Array<[string, string | undefined]> = [
    ['utm_source', token(input.utmSource)],
    ['utm_medium', token(input.utmMedium)],
    ['utm_campaign', token(input.utmCampaign)],
    ['referrer_host', token(input.referrerHost)],
    ['landing_path', token(input.landingPath?.split('?')[0])],
    ['cohort', token(input.cohort)],
    ['plan', token(input.plan)],
    ['interval', token(input.interval)],
    ['currency', token(input.currency)],
  ];
  for (const [key, value] of optional) if (value) out[key] = value;

  if (typeof input.amountCents === 'number' && Number.isFinite(input.amountCents) && input.amountCents >= 0) {
    out.amount_cents = Math.round(input.amountCents);
  }

  if (input.props) {
    const props: Record<string, string | number | boolean> = {};
    let n = 0;
    for (const [k, v] of Object.entries(input.props)) {
      if (n >= 20 || !PROP_KEY.test(k)) continue;
      if (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'boolean' || (typeof v === 'string' && TOKEN.test(v))) {
        props[k] = v;
        n++;
      }
    }
    if (n > 0) out.props = props;
  }
  return out;
}

/** Host of a referrer URL, or undefined for none / same-site / unparseable. */
export function referrerHost(referrer: string | null | undefined, ownHost?: string): string | undefined {
  if (!referrer) return undefined;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
    if (!host || (ownHost && host === ownHost.toLowerCase().replace(/^www\./, ''))) return undefined;
    return host;
  } catch {
    return undefined;
  }
}
