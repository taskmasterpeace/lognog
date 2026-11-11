import type { FunnelRung } from '../api/client';

/** Date ranges the Funnels page offers, in days. */
export const RANGES = [7, 30, 90];

const STAGE_LABELS: Record<string, string> = {
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
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? eventLabel(stage);
}

/** "points_dialog_opened" -> "Points dialog opened". */
export function eventLabel(name: string): string {
  const text = String(name || '').replace(/[_-]+/g, ' ').trim();
  if (!text) return 'Unknown';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function pctText(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 10) / 10}%`;
}

export function money(cents: number): string {
  const dollars = (cents || 0) / 100;
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: dollars % 1 === 0 ? 0 : 2 });
}

export function rangeLabel(days: number): string {
  return `last ${days} days`;
}

/** Bar width for a rung, as a percentage of the top rung. Tiny non-zero rungs stay visible. */
export function widthPct(people: number, top: number): number {
  if (top <= 0 || people <= 0) return 0;
  return Math.max(2, Math.min(100, (people / top) * 100));
}

/**
 * The drop shown ABOVE rung `index`: people lost since the previous rung that
 * applies. Nothing is shown for the first rung, for rungs that do not apply,
 * when either side is not reported yet, or when nobody was lost.
 */
export function dropBetween(rungs: FunnelRung[], index: number): { lost: number; pctLost: string } | null {
  const rung = rungs[index];
  if (!rung || !rung.applies || !rung.reported) return null;
  let prev: FunnelRung | undefined;
  for (let i = index - 1; i >= 0; i--) {
    if (rungs[i].applies) {
      prev = rungs[i];
      break;
    }
  }
  if (!prev || !prev.reported || prev.people <= 0) return null;
  const lost = prev.people - rung.people;
  if (lost <= 0) return null;
  return { lost, pctLost: pctText((lost / prev.people) * 100) };
}

/** Seconds each product stays on the smartboard: 20 by default, kept between 5 and 300. */
export function boardSeconds(raw: string | null | undefined): number {
  const n = Math.floor(Number(raw));
  if (!raw || !Number.isFinite(n)) return 20;
  return Math.min(300, Math.max(5, n));
}

/** The slide after (or before) this one, wrapping round. Safe with no slides. */
export function nextSlide(index: number, count: number, step: 1 | -1): number {
  if (count <= 0) return 0;
  return (((index + step) % count) + count) % count;
}

/** "up 3 from the week before" / "down 2 from the week before" / "the same as the week before". */
export function weekChange(now: number, before: number): string {
  if (now === before) return 'the same as the week before';
  const diff = now - before;
  return `${diff > 0 ? 'up' : 'down'} ${Math.abs(diff).toLocaleString('en-US')} from the week before`;
}

/**
 * "Money in" as shown: an amount, or "not reported" when payments arrived
 * without amounts (old log lines), so a real sale never reads as $0.
 */
export function moneyIn(revenueCents: number, payments: number, withoutAmount: number): { value: string; note?: string } {
  if (payments > 0 && withoutAmount >= payments) return { value: 'not reported', note: `${payments.toLocaleString('en-US')} payments came with no amount` };
  if (withoutAmount > 0) return { value: money(revenueCents), note: `${withoutAmount.toLocaleString('en-US')} of ${payments.toLocaleString('en-US')} payments came with no amount` };
  return { value: money(revenueCents) };
}
