#!/usr/bin/env node
/**
 * Sends made-up funnel steps for the three first products to a LogNog you
 * point it at, so the Funnels page has something to show on a dev machine.
 * Every person and number here is invented. Do NOT run it against production.
 *
 *   LOGNOG_URL=http://localhost:4001 LOGNOG_API_KEY=... node scripts/funnels/seed-demo.mjs
 *
 * LOGNOG_URL is the API base: no /api when talking to the API directly
 * (port 4001 in Lite), with /api when going through the UI proxy.
 */
const URL_BASE = (process.env.LOGNOG_URL || 'http://localhost:4001').replace(/\/+$/, '');
const KEY = process.env.LOGNOG_API_KEY;
if (!KEY) {
  console.error('Set LOGNOG_API_KEY (an ingest key for the local LogNog).');
  process.exit(1);
}
if (/machinekinglabs\.com/i.test(URL_BASE)) {
  console.error('Refusing to send made-up data to production.');
  process.exit(1);
}

// Small seeded random so every run makes the same people.
let seed = 20261111;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = (pairs) => {
  let r = rnd() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[0][0];
};
const DAY = 86_400_000;
const NOW = Date.now();

const PRODUCTS = [
  {
    slug: 'directors-palette', visitors: 900, days: 60,
    sources: [['youtube', 5], ['tiktok', 3], ['google', 3], ['reddit', 1], [null, 4]],
    signupStart: { youtube: 0.5, tiktok: 0.22, google: 0.4, reddit: 0.35, null: 0.3 },
    finishSignup: 0.62, firstUse: 0.7, comeBack: 0.45, seePrice: 0.5, checkout: 0.4, pay: 0.6, churn: 0,
    uses: ['image_generated', 'video_generated', 'recipe_run', 'storyboard_made'],
    paywalls: ['out_of_points', 'points_dialog_opened'],
    plans: [['starter', 999, 5], ['creator', 2499, 3], ['studio', 4999, 1]], interval: 'one_time', paid: 'points_purchased',
    payerBoost: 'video_generated', repeatPay: 0.35,
  },
  {
    slug: 'hey-youre-hired', visitors: 1400, days: 60,
    sources: [['linkedin', 4], ['google', 4], ['tiktok', 2], ['newsletter', 1], [null, 3]],
    signupStart: { linkedin: 0.45, google: 0.35, tiktok: 0.15, newsletter: 0.6, null: 0.25 },
    finishSignup: 0.48, firstUse: 0.55, comeBack: 0.38, seePrice: 0.6, checkout: 0.3, pay: 0.6, churn: 0.7,
    uses: ['job_recommendations_completed', 'cover_letter_completed', 'resume_tailoring_completed', 'career_coach_completed'],
    paywalls: ['job_limit_hit', 'pricing_viewed'],
    plans: [['professional', 2499, 4], ['professional_weekly', 699, 3], ['executive', 4999, 1]], interval: 'month', paid: 'subscription_paid',
    payerBoost: 'cover_letter_completed', repeatPay: 0.35, explicitActivate: true,
  },
  {
    slug: 'homework-tree', visitors: 500, days: 45,
    sources: [['facebook', 3], ['school_newsletter', 2], ['google', 2], [null, 3]],
    signupStart: { facebook: 0.3, school_newsletter: 0.65, google: 0.4, null: 0.3 },
    finishSignup: 0.7, firstUse: 0.75, comeBack: 0.6, seePrice: 0.55, checkout: 0.35, pay: 0.65, churn: 0.12,
    uses: ['sheet_read', 'practice_round_finished'],
    paywalls: ['trial_used'],
    plans: [['family', 699, 4], ['family', 5999, 1]], interval: 'month', paid: 'family_plan_paid',
    payerBoost: 'practice_round_finished', repeatPay: 0.4, cohorts: [['organic', 3], ['invited_tester', 1]],
  },
];

function personEvents(p, n) {
  const out = [];
  let t = NOW - rnd() * p.days * DAY;
  const step = (min, max) => (t += (min + rnd() * (max - min)) * 60_000);
  const anon = `a_${p.slug.slice(0, 2)}_${n.toString(36)}`;
  const user = `u_${p.slug.slice(0, 2)}_${n.toString(36)}`;
  const source = pick(p.sources);
  const base = { product: p.slug, surface: 'web', funnel_v: 1 };
  const src = source ? { utm_source: source } : {};
  const push = (stage, event, extra = {}) => {
    if (t > NOW) return false;
    out.push({ timestamp: new Date(t).toISOString(), level: 'info', message: `funnel ${stage} ${event}`, funnel_stage: stage, funnel_event: event, ...base, ...extra });
    return true;
  };

  push('visit', 'landing_viewed', { anon_id: anon, ...src, landing_path: '/' });
  if (rnd() > p.signupStart[String(source)]) return out;
  step(0.5, 6);
  push('signup_start', rnd() < 0.5 ? 'signup_form_opened' : 'google_signin_clicked', { anon_id: anon, ...src });
  if (rnd() > p.finishSignup) return out;
  step(0.5, 30);
  const cohort = p.cohorts ? pick(p.cohorts) : undefined;
  push('signup', 'signup_completed', { anon_id: anon, user_id: user, ...src, ...(cohort ? { cohort } : {}) });
  if (rnd() > p.firstUse) return out;

  step(2, 600);
  const willPay = rnd() < p.seePrice * p.checkout * p.pay * 2.2;
  const useOnce = () => push('use', willPay && rnd() < 0.6 ? p.payerBoost : pick(p.uses.map((u) => [u, 1])), { user_id: user });
  useOnce();
  if (p.explicitActivate) push('activate', 'activated', { user_id: user });
  const sessions = rnd() < p.comeBack || willPay ? 1 + Math.floor(rnd() * (willPay ? 9 : 6)) : 0;
  let sawPrice = false;
  for (let i = 0; i < sessions; i++) {
    t += (0.6 + rnd() * 4) * DAY;
    if (!useOnce()) break;
    if (rnd() < 0.5) {
      step(1, 20);
      useOnce();
    }
    if (!sawPrice && (willPay || rnd() < p.seePrice / 3)) {
      step(1, 10);
      sawPrice = push('paywall', pick(p.paywalls.map((w) => [w, 1])), { user_id: user });
    }
  }
  if (!sawPrice && rnd() < p.seePrice / 2) {
    step(5, 200);
    sawPrice = push('paywall', p.paywalls[0], { user_id: user });
  }
  if (!sawPrice) return out;
  if (!(willPay || rnd() < p.checkout / 2)) return out;
  step(1, 30);
  const [plan, cents] = pick(p.plans.map((pl) => [[pl[0], pl[1]], pl[2]]));
  const interval = p.slug === 'homework-tree' && cents > 2000 ? 'year' : p.slug === 'hey-youre-hired' && cents < 1000 ? 'week' : p.interval;
  push('checkout', 'checkout_started', { user_id: user, plan, interval });
  if (!(willPay || rnd() < p.pay / 3)) return out;
  step(1, 8);
  if (!push('paid', p.paid, { user_id: user, plan, interval, amount_cents: cents, currency: 'usd', event_id: `evt_${user}_1` })) return out;
  if (rnd() < p.repeatPay) {
    t += (interval === 'week' ? 7 : interval === 'one_time' ? 5 + rnd() * 20 : 30) * DAY;
    useOnce();
    push('paid', p.paid, { user_id: user, plan, interval, amount_cents: cents, currency: 'usd', event_id: `evt_${user}_2` });
  } else if (rnd() < p.churn) {
    t += (8 + rnd() * 20) * DAY;
    push('churn', p.slug === 'homework-tree' ? 'family_plan_cancelled' : 'subscription_cancelled', { user_id: user, plan, event_id: `evt_${user}_c` });
  }
  return out;
}

async function send(index, events) {
  for (let i = 0; i < events.length; i += 400) {
    const res = await fetch(`${URL_BASE}/ingest/http`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY, 'X-Index': index, 'X-App-Name': index },
      body: JSON.stringify(events.slice(i, i + 400)),
    });
    if (!res.ok) throw new Error(`${index}: ingest answered ${res.status} ${await res.text()}`);
  }
}

for (const p of PRODUCTS) {
  const events = [];
  for (let n = 0; n < p.visitors; n++) events.push(...personEvents(p, n));
  await send(p.slug, events);
  console.log(`${p.slug}: sent ${events.length} made-up funnel steps for ${p.visitors} made-up visitors`);
}
