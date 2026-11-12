/**
 * The weekly funnel report: every product, the last 7 days next to the 7 days
 * before, in plain words. Built from the same maths as the Funnels page.
 *
 * Sent by email every Monday 9:00 AM Eastern (see maybeSendWeeklyFunnelReport)
 * and readable any time at /funnels/weekly.
 */
import { buildFunnelReport, FunnelEvent, FunnelReport, LadderRung } from './compute.js';
import { FUNNEL_PRODUCTS, FunnelProduct } from './model.js';
import { fetchFunnelEvents } from './store.js';
import { FUNNEL_LOGO_PNG_BASE64 } from './logos.js';
import { buildProductHealth } from './health.js';

const DAY = 86_400_000;
/** History read before the two weeks, so returning customers are not counted as new. */
const HISTORY_DAYS = 90;

export interface WeeklyStep {
  stage: string;
  label: string;
  applies: boolean;
  reported: boolean;
  people: number;
  pctOfPrevious: number | null;
  lost: number;
  /** Same step for the week before; null when that step does not apply. */
  peopleBefore: number | null;
}

export interface WeeklySection {
  product: { slug: string; name: string; quietDays: number };
  /** False when the product has sent no funnel steps at all yet. */
  hasData: boolean;
  /** One plain sentence: the most useful thing to know this week. */
  headline: string;
  getIn: WeeklyStep[];
  pay: WeeklyStep[];
  biggestLeak: { from: string; to: string; lost: number; outOf: number; pctLost: number; sentence: string } | null;
  quiet: { now: number; before: number; change: number; accounts: number };
  money: { newPayers: number; newPayersBefore: number; payments: number; paymentsWithoutAmount: number; revenueCents: number; revenueCentsBefore: number };
  notReported: string[];
  truncated: boolean;
  /** The product's one-sentence health line, for products that have one. */
  healthLine?: string;
}

export interface WeeklyFunnelReport {
  generatedAt: string;
  weekStart: string;
  weekEnd: string;
  /** "Nov 9 – Nov 16, 2026" */
  title: string;
  sections: WeeklySection[];
}

function steps(now: LadderRung[], before: LadderRung[]): WeeklyStep[] {
  return now.map((r) => {
    const b = before.find((x) => x.stage === r.stage);
    return {
      stage: r.stage,
      label: r.label,
      applies: r.applies,
      reported: r.reported,
      people: r.people,
      pctOfPrevious: r.pctOfPrevious,
      lost: r.lost,
      peopleBefore: b && b.applies ? b.people : null,
    };
  });
}

/** How the step BEFORE a leak reads in a sentence: "visitors", "people who signed up"... */
const WHO: Record<string, string> = {
  visit: 'visitors',
  signup_start: 'people who started sign-up',
  signup: 'people who signed up',
  activate: 'people who used it once',
  paywall: 'people who saw the price',
  checkout: 'people who started checkout',
};
const WHO_ONE: Record<string, string> = {
  visit: 'visitor',
  signup_start: 'person who started sign-up',
  signup: 'person who signed up',
  activate: 'person who used it once',
  paywall: 'person who saw the price',
  checkout: 'person who started checkout',
};
const DID_NOT: Record<string, string> = {
  signup_start: 'left without starting sign-up',
  signup: 'did not finish signing up',
  activate: 'never used it',
  return: 'did not come back',
  paywall: 'never saw a price',
  checkout: 'saw the price and did not start checkout',
  paid: 'started checkout and did not pay',
};

/**
 * Steps people take within minutes. Only these can be called a leak in a
 * 7-day report: someone who signed up yesterday has not "failed to come back".
 */
const IMMEDIATE_STEPS = new Set(['signup_start', 'signup', 'checkout', 'paid']);

function findLeak(ladders: LadderRung[][]): WeeklySection['biggestLeak'] {
  let best: WeeklySection['biggestLeak'] = null;
  for (const rungs of ladders) {
    let prev: LadderRung | null = null;
    for (const r of rungs) {
      if (!r.applies) continue;
      if (prev && prev.reported && r.reported && prev.people > 0 && IMMEDIATE_STEPS.has(r.stage)) {
        const lost = prev.people - r.people;
        if (lost > 0 && (!best || lost > best.lost)) {
          const pctLost = Math.round((lost / prev.people) * 1000) / 10;
          best = {
            from: prev.stage,
            to: r.stage,
            lost,
            outOf: prev.people,
            pctLost,
            sentence: `${lost.toLocaleString('en-US')} of ${prev.people.toLocaleString('en-US')} ${prev.people === 1 ? (WHO_ONE[prev.stage] ?? 'person') : (WHO[prev.stage] ?? 'people')} (${pctLost}%) ${DID_NOT[r.stage] ?? 'went no further'}.`,
          };
        }
      }
      prev = r;
    }
  }
  return best;
}

export function money(cents: number): string {
  const dollars = (cents || 0) / 100;
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: dollars % 1 === 0 ? 0 : 2 });
}

function change(now: number, before: number): string {
  if (now === before) return 'the same as the week before';
  const diff = now - before;
  return `${diff > 0 ? 'up' : 'down'} ${Math.abs(diff).toLocaleString('en-US')} from the week before`;
}

/** One product's section. Pure: give it the events and the moment the week ends. */
export function buildWeeklySection(product: FunnelProduct, events: FunnelEvent[], weekEnd: number, truncated = false): WeeklySection {
  const weekStart = weekEnd - 7 * DAY;
  const prevStart = weekStart - 7 * DAY;
  const now: FunnelReport = buildFunnelReport(product, events, { from: weekStart, to: weekEnd, now: weekEnd });
  // The week before, as it looked when THAT week ended, so both weeks have had the same time to progress.
  const before: FunnelReport = buildFunnelReport(product, events, { from: prevStart, to: weekStart, now: weekStart });

  const leak = findLeak([now.getIn, now.pay]);
  const hasData = now.totals.events > 0;
  const visit = now.getIn.find((r) => r.stage === 'visit');
  const signup = now.getIn.find((r) => r.stage === 'signup');
  const beforeSignup = before.getIn.find((r) => r.stage === 'signup');

  let headline: string;
  if (!hasData) {
    headline = `${product.name} has not sent any funnel steps yet, so there is nothing to report.`;
  } else if (leak) {
    headline = `Biggest leak: ${leak.sentence}`;
  } else if (signup && signup.people > 0) {
    headline = `${signup.people.toLocaleString('en-US')} new ${signup.people === 1 ? 'account' : 'accounts'} this week, ${change(signup.people, beforeSignup?.people ?? 0)}.`;
  } else if (visit && visit.reported) {
    headline = `${visit.people.toLocaleString('en-US')} new ${visit.people === 1 ? 'visitor' : 'visitors'} this week and no new accounts.`;
  } else {
    headline = 'No new people this week.';
  }

  return {
    product: { slug: product.slug, name: product.name, quietDays: product.quietDays },
    hasData,
    headline,
    getIn: steps(now.getIn, before.getIn),
    pay: steps(now.pay, before.pay),
    biggestLeak: hasData ? leak : null,
    quiet: { now: now.stopping.quiet, before: before.stopping.quiet, change: now.stopping.quiet - before.stopping.quiet, accounts: now.stopping.signedUp },
    money: {
      newPayers: now.movingToPaid.payers,
      newPayersBefore: before.movingToPaid.payers,
      payments: now.movingToPaid.payments,
      paymentsWithoutAmount: now.movingToPaid.paymentsWithoutAmount,
      revenueCents: now.movingToPaid.revenueCents,
      revenueCentsBefore: before.movingToPaid.revenueCents,
    },
    notReported: now.notReported,
    truncated,
    ...(product.health && hasData ? { healthLine: buildProductHealth(product, events, weekEnd, HISTORY_DAYS)?.line } : {}),
  };
}

function titleFor(weekStart: number, weekEnd: number): string {
  const fmt = (ms: number, withYear: boolean) =>
    new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'America/New_York' });
  return `7 days to ${fmt(weekEnd, true)}`;
}

/** Build the whole report from the live log store, cut to the indexes the caller may read. */
export async function getWeeklyFunnelReport(opts: { now?: number; allowedIndexes?: string[] | null } = {}): Promise<WeeklyFunnelReport> {
  const weekEnd = opts.now ?? Date.now();
  const weekStart = weekEnd - 7 * DAY;
  const allowed = opts.allowedIndexes && opts.allowedIndexes.length > 0 ? opts.allowedIndexes.map((i) => String(i).toLowerCase()) : null;
  const products = FUNNEL_PRODUCTS.filter((p) => !allowed || p.indexes.some((i) => allowed.includes(i)));
  const sections: WeeklySection[] = [];
  for (const product of products) {
    const { events, truncated } = await fetchFunnelEvents(product, weekEnd - (14 + HISTORY_DAYS) * DAY, opts.allowedIndexes);
    sections.push(buildWeeklySection(product, events, weekEnd, truncated));
  }
  return {
    generatedAt: new Date().toISOString(),
    weekStart: new Date(weekStart).toISOString(),
    weekEnd: new Date(weekEnd).toISOString(),
    title: titleFor(weekStart, weekEnd),
    sections,
  };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BROWN = '#5A3F24';
const DARK = '#3D2A18';
const CREAM = '#FAF8F5';
const SAND = '#F5F0E8';
const LINE = '#E6DCCB';
const MUTED = '#8B7355';
const HONEY = '#C8862B';
const WARN = '#B4531A';

function stepRows(list: WeeklyStep[], color: string): string {
  const top = list.find((s) => s.applies)?.people ?? 0;
  return list
    .map((s) => {
      if (!s.applies) {
        return `<tr><td style="padding:5px 0;font-size:14px;color:${DARK};width:150px;">${esc(s.label)}</td><td colspan="2" style="padding:5px 0;font-size:13px;color:${MUTED};font-style:italic;">does not apply to this product</td></tr>`;
      }
      const width = top > 0 && s.people > 0 ? Math.max(2, Math.round((s.people / top) * 100)) : 0;
      const note = !s.reported
        ? 'not reported yet'
        : s.pctOfPrevious === null
          ? 'start'
          : `${s.pctOfPrevious}% of the step above${s.lost > 0 ? `, ${s.lost.toLocaleString('en-US')} lost` : ''}`;
      const wow = s.peopleBefore === null || !s.reported ? '' : ` &middot; week before: ${s.peopleBefore.toLocaleString('en-US')}`;
      return `<tr>
<td style="padding:5px 0;font-size:14px;color:${DARK};width:150px;">${esc(s.label)}</td>
<td style="padding:5px 8px 5px 0;font-size:16px;font-weight:700;color:${DARK};width:56px;text-align:right;">${s.people.toLocaleString('en-US')}</td>
<td style="padding:5px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td style="background:${SAND};border-radius:4px;height:12px;line-height:12px;font-size:1px;"><div style="width:${width}%;background:${color};height:12px;border-radius:4px;opacity:${s.reported ? 1 : 0.35};">&nbsp;</div></td></tr></table>
<div style="font-size:12px;color:${MUTED};padding-top:2px;">${note}${wow}</div>
</td></tr>`;
    })
    .join('\n');
}

/** The email. Logos are attached and referenced by cid:funnel-logo-<slug>. */
export function renderWeeklyFunnelEmail(report: WeeklyFunnelReport, pageUrl?: string): string {
  const sections = report.sections
    .map((s) => {
      const logo = FUNNEL_LOGO_PNG_BASE64[s.product.slug]
        ? `<img src="cid:funnel-logo-${s.product.slug}" width="44" height="44" alt="${esc(s.product.name)} logo" style="display:block;border-radius:8px;">`
        : '';
      const head = `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;">${logo}</td><td><div style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:${DARK};">${esc(s.product.name)}</div></td></tr></table>`;
      if (!s.hasData) {
        return `<tr><td style="padding:20px 24px;border-top:1px solid ${LINE};">${head}<p style="margin:12px 0 0;font-size:14px;color:${MUTED};"><strong style="color:${WARN};">No real data yet.</strong> ${esc(s.headline)}</p></td></tr>`;
      }
      const m = s.money;
      const missing = s.notReported.length
        ? `<p style="margin:10px 0 0;font-size:12px;color:${WARN};">Not reported by this product yet: ${esc(s.notReported.join(', ').replace(/_/g, ' '))}.</p>`
        : '';
      return `<tr><td style="padding:20px 24px;border-top:1px solid ${LINE};">
${head}
<p style="margin:12px 0 14px;font-size:15px;color:${DARK};background:${SAND};border-left:4px solid ${HONEY};padding:10px 12px;border-radius:4px;">${esc(s.headline)}</p>
<div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};font-weight:700;">Getting in</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${stepRows(s.getIn, HONEY)}</table>
<div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};font-weight:700;padding-top:12px;">Paying</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${stepRows(s.pay, BROWN)}</table>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:14px;"><tr>
<td width="33%" style="background:${SAND};border-radius:8px;padding:10px 12px;"><div style="font-size:11px;text-transform:uppercase;color:${MUTED};">Went quiet</div><div style="font-size:22px;font-weight:700;color:${WARN};">${s.quiet.now.toLocaleString('en-US')}</div><div style="font-size:12px;color:${MUTED};">${esc(change(s.quiet.now, s.quiet.before))}</div></td>
<td width="8"></td>
<td width="33%" style="background:${SAND};border-radius:8px;padding:10px 12px;"><div style="font-size:11px;text-transform:uppercase;color:${MUTED};">New payers</div><div style="font-size:22px;font-weight:700;color:${DARK};">${m.newPayers.toLocaleString('en-US')}</div><div style="font-size:12px;color:${MUTED};">${esc(change(m.newPayers, m.newPayersBefore))}</div></td>
<td width="8"></td>
<td width="33%" style="background:${SAND};border-radius:8px;padding:10px 12px;"><div style="font-size:11px;text-transform:uppercase;color:${MUTED};">Money in</div><div style="font-size:22px;font-weight:700;color:${DARK};">${m.payments > 0 && m.paymentsWithoutAmount >= m.payments ? 'not reported' : money(m.revenueCents)}</div><div style="font-size:12px;color:${MUTED};">${m.paymentsWithoutAmount > 0 ? `${m.paymentsWithoutAmount} of ${m.payments} payments came with no amount` : `week before: ${money(m.revenueCentsBefore)}`}</div></td>
</tr></table>
<p style="margin:8px 0 0;font-size:12px;color:${MUTED};">Went quiet = has an account and has not used ${esc(s.product.name)} for ${s.product.quietDays} days.</p>
${s.healthLine ? `<p style="margin:10px 0 0;font-size:13px;color:${DARK};">${esc(s.healthLine)}</p>` : ''}
${missing}${s.truncated ? `<p style="margin:10px 0 0;font-size:12px;color:${WARN};">Too many steps to read them all; the oldest were left out, so these numbers are low.</p>` : ''}
</td></tr>`;
    })
    .join('\n');

  const lognogLogo = FUNNEL_LOGO_PNG_BASE64.lognog ? `<img src="cid:funnel-logo-lognog" width="40" height="40" alt="LogNog logo" style="display:block;border-radius:8px;">` : '';
  const link = pageUrl ? `<p style="margin:0;font-size:13px;"><a href="${esc(pageUrl)}" style="color:${HONEY};font-weight:700;">Open this report in LogNog</a></p>` : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:${CREAM};font-family:Inter,Segoe UI,Arial,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${CREAM};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;background:#FFFFFF;border:1px solid ${LINE};border-radius:10px;">
<tr><td style="padding:20px 24px;background:${BROWN};border-radius:10px 10px 0 0;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;">${lognogLogo}</td><td>
<div style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:${CREAM};">Weekly funnel report</div>
<div style="font-size:13px;color:#E6DCCB;">${esc(report.title)} &middot; the last 7 days next to the 7 days before</div>
</td></tr></table></td></tr>
${sections}
<tr><td style="padding:16px 24px;border-top:1px solid ${LINE};">${link}
<p style="margin:8px 0 0;font-size:12px;color:${MUTED};">Every number is people, not clicks. Each product has its own meaning of "first real use" and "paid", so products are never added together.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

/** Attachments for the email's logos. */
export function weeklyFunnelLogoAttachments(report: WeeklyFunnelReport): Array<{ filename: string; content: Buffer; cid: string; contentType: string }> {
  const slugs = ['lognog', ...report.sections.map((s) => s.product.slug)];
  return slugs
    .filter((slug) => FUNNEL_LOGO_PNG_BASE64[slug])
    .map((slug) => ({ filename: `${slug}.png`, content: Buffer.from(FUNNEL_LOGO_PNG_BASE64[slug], 'base64'), cid: `funnel-logo-${slug}`, contentType: 'image/png' }));
}

// ---------------------------------------------------------------------------
// Monday 9:00 AM Eastern
// ---------------------------------------------------------------------------

/** Eastern-time weekday, hour, minute and date for a moment. */
export function easternParts(at: Date): { weekday: string; hour: number; minute: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { weekday: get('weekday'), hour: Number(get('hour')), minute: Number(get('minute')), date: `${get('year')}-${get('month')}-${get('day')}` };
}

/**
 * Is the weekly email due at this moment, given the Eastern date it was last
 * sent for? Due = Monday, from 9:00 up to (not including) noon Eastern, and
 * not already sent for this Monday. The three-hour window means a restart at
 * 9:00 does not skip the week; the "already sent" check means it goes once.
 */
export function weeklyFunnelDue(at: Date, lastSentFor: string | null): { due: boolean; key: string } {
  const p = easternParts(at);
  return { due: p.weekday === 'Mon' && p.hour >= 9 && p.hour < 12 && lastSentFor !== p.date, key: p.date };
}
