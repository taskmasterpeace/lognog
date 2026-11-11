import { describe, it, expect } from 'vitest';
import { buildWeeklySection, easternParts, renderWeeklyFunnelEmail, weeklyFunnelDue, weeklyFunnelLogoAttachments, WeeklyFunnelReport } from './weekly';
import { FunnelEvent } from './compute';
import { findFunnelProduct } from './model';

const DAY = 86_400_000;
const END = Date.UTC(2026, 10, 16, 14); // Mon Nov 16 2026, 9:00 AM Eastern
const dp = findFunnelProduct('directors-palette')!;
const ht = findFunnelProduct('homework-tree')!;

let n = 0;
const ev = (daysBeforeEnd: number, stage: FunnelEvent['stage'], who: { a?: string; u?: string }, extra: Partial<FunnelEvent> = {}): FunnelEvent => ({
  ts: END - daysBeforeEnd * DAY + ++n,
  stage,
  event: extra.event ?? stage,
  anonId: who.a,
  userId: who.u,
  ...extra,
});

function sampleEvents(): FunnelEvent[] {
  return [
    // this week: 4 visitors, 2 start sign-up, 1 signs up, uses it and pays
    ev(3, 'visit', { a: 'a1' }), ev(3, 'visit', { a: 'a2' }), ev(3, 'visit', { a: 'a3' }), ev(3, 'visit', { a: 'a4' }),
    ev(3, 'signup_start', { a: 'a3' }), ev(3, 'signup_start', { a: 'a4' }),
    ev(3, 'signup', { a: 'a4', u: 'u4' }), ev(2.9, 'use', { u: 'u4' }),
    ev(2, 'paywall', { u: 'u4' }), ev(2, 'checkout', { u: 'u4' }), ev(2, 'paid', { u: 'u4' }, { amountCents: 999, plan: 'starter' }),
    // the week before: 2 visitors, both sign up
    ev(10, 'visit', { a: 'b1' }), ev(10, 'signup', { a: 'b1', u: 'v1' }), ev(10, 'visit', { a: 'b2' }), ev(10, 'signup', { a: 'b2', u: 'v2' }),
    ev(9, 'paid', { u: 'v1' }, { amountCents: 2499, plan: 'creator' }),
    // an old account that used it long ago: quiet in both weeks
    ev(80, 'signup', { u: 'old' }), ev(79, 'use', { u: 'old' }),
  ];
}

describe('weekly funnel report: one product', () => {
  const s = buildWeeklySection(dp, sampleEvents(), END);

  it('shows this week next to the week before, step by step', () => {
    expect(s.getIn.map((x) => [x.stage, x.people, x.peopleBefore])).toEqual([
      ['visit', 4, 2],
      ['signup_start', 2, 2],
      ['signup', 1, 2],
      ['activate', 1, 0],
      ['return', 0, 0],
    ]);
  });

  it('names the single biggest leak in a plain sentence', () => {
    expect(s.biggestLeak).toMatchObject({ from: 'visit', to: 'signup_start', lost: 2, outOf: 4, pctLost: 50 });
    expect(s.headline).toBe('Biggest leak: 2 of 4 visitors (50%) left without starting sign-up.');
  });

  it('counts new payers and money in for each week', () => {
    expect(s.money).toEqual({ newPayers: 1, newPayersBefore: 1, payments: 1, paymentsWithoutAmount: 0, revenueCents: 999, revenueCentsBefore: 2499 });
  });

  it('counts who has gone quiet, and the change', () => {
    expect(s.quiet.now).toBe(1);
    expect(s.quiet.before).toBe(1);
    expect(s.quiet.change).toBe(0);
  });

  it('marks a step the product cannot have as "does not apply", and says plainly when there is no data', () => {
    expect(s.notReported).not.toContain('churn');
    const empty = buildWeeklySection(ht, [], END);
    expect(empty.hasData).toBe(false);
    expect(empty.headline).toMatch(/has not sent any funnel steps yet/);
    expect(empty.biggestLeak).toBeNull();
  });
});

describe('weekly funnel report: the email', () => {
  const report: WeeklyFunnelReport = {
    generatedAt: new Date(END).toISOString(),
    weekStart: new Date(END - 7 * DAY).toISOString(),
    weekEnd: new Date(END).toISOString(),
    title: 'Nov 9 – Nov 16, 2026',
    sections: [buildWeeklySection(dp, sampleEvents(), END), buildWeeklySection(ht, [], END)],
  };
  const html = renderWeeklyFunnelEmail(report, 'https://logs.example.test/funnels/weekly');

  it('leads each product with its logo and attaches every logo it refers to', () => {
    expect(html).toContain('cid:funnel-logo-directors-palette');
    expect(html).toContain('cid:funnel-logo-homework-tree');
    expect(html).toContain('cid:funnel-logo-lognog');
    const attached = weeklyFunnelLogoAttachments(report).map((a) => a.cid);
    for (const cid of html.match(/cid:funnel-logo-[a-z-]+/g) ?? []) expect(attached).toContain(cid.replace('cid:', ''));
    for (const a of weeklyFunnelLogoAttachments(report)) expect(a.content.subarray(1, 4).toString()).toBe('PNG');
  });

  it('says so when a product has no real data yet', () => {
    expect(html).toContain('No real data yet.');
  });

  it('carries the numbers, the leak and the link', () => {
    expect(html).toContain('Biggest leak: 2 of 4 visitors (50%) left without starting sign-up.');
    expect(html).toContain('$9.99');
    expect(html).toContain('week before: $24.99');
    expect(html).toContain('https://logs.example.test/funnels/weekly');
  });

  it('uses the LogNog brown and cream and no purple', () => {
    expect(html).toContain('#5A3F24');
    expect(html).toContain('#FAF8F5');
    for (const hex of html.match(/#[0-9A-Fa-f]{6}\b/g) ?? []) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 25) continue;
      let h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
      h = (h * 60 + 360) % 360;
      expect(h >= 250 && h <= 330, `${hex} is a purple hue`).toBe(false);
    }
  });

  it('escapes product text', () => {
    const odd = { ...report, sections: [{ ...report.sections[0], headline: '<script>x</script>' }] };
    expect(renderWeeklyFunnelEmail(odd)).not.toContain('<script>x</script>');
  });
});

describe('weekly funnel report: Monday 9:00 AM Eastern', () => {
  it('reads the Eastern clock in winter and in summer', () => {
    expect(easternParts(new Date(Date.UTC(2026, 10, 16, 14, 0)))).toEqual({ weekday: 'Mon', hour: 9, minute: 0, date: '2026-11-16' });
    expect(easternParts(new Date(Date.UTC(2026, 6, 13, 13, 0)))).toEqual({ weekday: 'Mon', hour: 9, minute: 0, date: '2026-07-13' });
  });

  it('is due from 9:00 on Monday, once', () => {
    const nine = new Date(Date.UTC(2026, 10, 16, 14, 0));
    expect(weeklyFunnelDue(nine, null)).toEqual({ due: true, key: '2026-11-16' });
    expect(weeklyFunnelDue(nine, '2026-11-09').due).toBe(true);
    expect(weeklyFunnelDue(nine, '2026-11-16').due).toBe(false); // already sent today
  });

  it('is not due before 9:00, after noon, or on another day', () => {
    expect(weeklyFunnelDue(new Date(Date.UTC(2026, 10, 16, 13, 59)), null).due).toBe(false); // 8:59 AM
    expect(weeklyFunnelDue(new Date(Date.UTC(2026, 10, 16, 17, 0)), null).due).toBe(false); // noon
    expect(weeklyFunnelDue(new Date(Date.UTC(2026, 10, 17, 14, 0)), null).due).toBe(false); // Tuesday
  });

  it('still goes out if the server was restarting at 9:00', () => {
    expect(weeklyFunnelDue(new Date(Date.UTC(2026, 10, 16, 15, 20)), '2026-11-09').due).toBe(true); // 10:20 AM
  });
});
