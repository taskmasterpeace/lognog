import { describe, it, expect } from 'vitest';
import { normalizeFunnelEvent, findFunnelProduct, SENT_STAGES, FUNNEL_PRODUCTS } from './model';

describe('funnel language: products', () => {
  it('finds a product by slug or by index', () => {
    expect(findFunnelProduct('directors-palette')?.name).toBe('Directors Palette');
    expect(findFunnelProduct('HEY-YOURE-HIRED')?.slug).toBe('hey-youre-hired');
    expect(findFunnelProduct('knowledge-league')?.slug).toBe('homework-tree');
    expect(findFunnelProduct('nope')).toBeUndefined();
  });

  it('every product only marks real stage names as not applicable', () => {
    const known = new Set<string>([...SENT_STAGES, 'return']);
    for (const p of FUNNEL_PRODUCTS) for (const s of p.notApplicable) expect(known.has(s)).toBe(true);
  });
});

describe('funnel language: tidy-up on the way in', () => {
  it('leaves an ordinary log line exactly as it was', () => {
    const e = { message: 'GET /api/x 200', user_email: 'a@b.co' };
    expect(normalizeFunnelEvent(e, 'some-app')).toBe(e);
  });

  it('accepts a standard event, lower-cases names and fills in the product', () => {
    const out = normalizeFunnelEvent(
      { funnel_stage: 'Signup', funnel_event: 'Signup Completed', anon_id: 'a1', user_id: 'u1', utm_source: 'tiktok' },
      'directors-palette',
    );
    expect(out).toMatchObject({ funnel_stage: 'signup', funnel_event: 'signup_completed', product: 'directors-palette', funnel_v: 1, anon_id: 'a1', user_id: 'u1' });
  });

  it('flags an unknown stage so it never counts', () => {
    const out = normalizeFunnelEvent({ funnel_stage: 'purchase_maybe', user_id: 'u1' }, 'directors-palette');
    expect(out.funnel_stage).toBeUndefined();
    expect(String(out.funnel_error)).toContain('unknown stage');
  });

  it('leaves the other fields of a line alone when a product marks a line it already sends', () => {
    const out = normalizeFunnelEvent(
      { message: 'User signup', funnel_stage: 'signup', funnel_event: 'signup_completed', user_id: 'u1', user_email: 'x@y.com', auth_method: 'google', props: { email: 'x@y.com', plan_seen: 'pro' } },
      'hey-youre-hired',
    );
    // existing dashboards read these
    expect(out).toMatchObject({ message: 'User signup', user_email: 'x@y.com', auth_method: 'google', user_id: 'u1', funnel_stage: 'signup' });
    // but the funnel's own extras never carry personal values
    expect(out.props).toEqual({ plan_seen: 'pro' });
  });

  it('refuses an email or a sentence as an id', () => {
    const out = normalizeFunnelEvent({ funnel_stage: 'visit', anon_id: 'pat@example.com', user_id: 'two words' }, 'hey-youre-hired');
    expect(out.anon_id).toBeUndefined();
    expect(out.user_id).toBeUndefined();
  });

  it('keeps money as whole cents and drops nonsense amounts', () => {
    expect(normalizeFunnelEvent({ funnel_stage: 'paid', user_id: 'u', amount_cents: '699.4' }, 'homework-tree').amount_cents).toBe(699);
    expect(normalizeFunnelEvent({ funnel_stage: 'paid', user_id: 'u', amount_cents: -5 }, 'homework-tree').amount_cents).toBeUndefined();
  });

  describe('Homework Tree (kids product): allowlist only', () => {
    it('drops every field that is not on the list, and all free text', () => {
      const out = normalizeFunnelEvent(
        {
          funnel_stage: 'use',
          funnel_event: 'homework_session_finished',
          user_id: 'parent_abc',
          child_id: 'kid-1',
          child_name: 'Sam',
          worksheet_text: '2 + 2 = ?',
          photo_url: 'https://x/y.jpg',
          message: 'Sam finished fractions',
          utm_campaign: 'has spaces and words',
          props: { subject: 'math', note: 'a full sentence about a child', grade_band: 'k-2', answers: ['a'], count: 3 },
        },
        'homework-tree',
      );
      expect(out.child_id).toBeUndefined();
      expect(out.child_name).toBeUndefined();
      expect(out.worksheet_text).toBeUndefined();
      expect(out.photo_url).toBeUndefined();
      expect(out.utm_campaign).toBeUndefined();
      expect(out.message).toBe('funnel use homework_session_finished');
      expect(out.props).toEqual({ subject: 'math', grade_band: 'k-2', count: 3 });
      expect(out.user_id).toBe('parent_abc');
    });

    it('applies the same rules when the event lands in the old index name', () => {
      const out = normalizeFunnelEvent({ funnel_stage: 'visit', anon_id: 'a', child_name: 'Sam' }, 'knowledge-league');
      expect(out.child_name).toBeUndefined();
      expect(out.product).toBe('homework-tree');
    });
  });

  describe('bridge rules for log lines products already send', () => {
    it('reads a Directors Palette payment line as "paid"', () => {
      const line = { message: 'payment_completed', type: 'business', user_id: 'u9', amount_cents: 999, stripe_session_id: 'cs_1', package_name: 'Starter' };
      const out = normalizeFunnelEvent(line, 'directors-palette');
      expect(out).toMatchObject({ funnel_stage: 'paid', funnel_event: 'points_purchased', event_id: 'cs_1', plan: 'Starter', funnel_legacy: 1, type: 'business' });
    });

    it('matches on the `event` field and on extra conditions', () => {
      expect(normalizeFunnelEvent({ message: 'Generation completed', event: 'generation_completed', user_id: 'u' }, 'directors-palette').funnel_stage).toBe('use');
      expect(normalizeFunnelEvent({ message: 'credit_event', status: 'insufficient', action: 'deduct', user_id: 'u' }, 'directors-palette').funnel_stage).toBe('paywall');
      expect(normalizeFunnelEvent({ message: 'credit_event', status: 'insufficient', action: 'bonus', user_id: 'u' }, 'directors-palette').funnel_stage).toBeUndefined();
      expect(normalizeFunnelEvent({ message: 'credit_event', status: 'ok', user_id: 'u' }, 'directors-palette').funnel_stage).toBeUndefined();
    });

    it('matches a prefix for Hey You\'re Hired feature lines and maps old field names', () => {
      expect(normalizeFunnelEvent({ message: 'Feature completed: cover_letter', user_id: 'u' }, 'hey-youre-hired').funnel_stage).toBe('use');
      const co = normalizeFunnelEvent({ message: 'Checkout started', plan_selected: 'professional', user_id: 'u' }, 'hey-youre-hired');
      expect(co).toMatchObject({ funnel_stage: 'checkout', plan: 'professional' });
    });

    it('never rewrites a line the product already marked as a funnel step', () => {
      const out = normalizeFunnelEvent({ message: 'payment_completed', funnel_stage: 'paid', funnel_event: 'points_purchased', user_id: 'u' }, 'directors-palette');
      expect(out.funnel_legacy).toBeUndefined();
    });
  });
});
