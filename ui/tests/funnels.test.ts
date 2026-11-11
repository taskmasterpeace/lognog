import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropBetween, eventLabel, money, moneyIn, pctText, stageLabel, widthPct } from '../src/utils/funnels.ts';

const rung = (stage: string, people: number, over: Record<string, unknown> = {}) => ({
  stage, label: stage, people, pctOfPrevious: null, lost: 0, pctOfTop: null, applies: true, reported: true, ...over,
});

test('drop between two rungs is people lost and the share of the step above', () => {
  const rungs = [rung('visit', 200), rung('signup', 50)];
  assert.deepEqual(dropBetween(rungs, 1), { lost: 150, pctLost: '75%' });
  assert.equal(dropBetween(rungs, 0), null);
});

test('drop skips a rung that does not apply and measures against the one before it', () => {
  const rungs = [rung('visit', 100), rung('signup_start', 0, { applies: false }), rung('signup', 40)];
  assert.deepEqual(dropBetween(rungs, 2), { lost: 60, pctLost: '60%' });
  assert.equal(dropBetween(rungs, 1), null);
});

test('no drop is shown when a side is not reported yet, or nobody was lost', () => {
  assert.equal(dropBetween([rung('visit', 0, { reported: false }), rung('signup', 0)], 1), null);
  assert.equal(dropBetween([rung('visit', 10), rung('signup', 0, { reported: false })], 1), null);
  assert.equal(dropBetween([rung('visit', 10), rung('signup', 10)], 1), null);
});

test('labels, money and percentages read plainly', () => {
  assert.equal(stageLabel('paywall'), 'Saw the price');
  assert.equal(eventLabel('points_dialog_opened'), 'Points dialog opened');
  assert.equal(eventLabel(''), 'Unknown');
  assert.equal(pctText(33.333), '33.3%');
  assert.equal(pctText(null), '—');
  assert.equal(money(699), '$6.99');
  assert.equal(money(250000), '$2,500');
});

test('a tiny rung keeps a visible bar; an empty one has none', () => {
  assert.equal(widthPct(1, 1000), 2);
  assert.equal(widthPct(0, 1000), 0);
  assert.equal(widthPct(500, 1000), 50);
  assert.equal(widthPct(5, 0), 0);
});

test('money in never reads as $0 when payments arrived without amounts', () => {
  assert.deepEqual(moneyIn(0, 3, 3), { value: 'not reported', note: '3 payments came with no amount' });
  assert.deepEqual(moneyIn(999, 3, 1), { value: '$9.99', note: '1 of 3 payments came with no amount' });
  assert.deepEqual(moneyIn(999, 1, 0), { value: '$9.99' });
  assert.deepEqual(moneyIn(0, 0, 0), { value: '$0' });
});
