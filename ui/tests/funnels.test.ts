import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardSeconds, dropBetween, eventLabel, money, nextSlide, pctText, stageLabel, weekChange, widthPct } from '../src/utils/funnels.ts';

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

test('the smartboard moves on every 20 seconds unless told otherwise, within sane limits', () => {
  assert.equal(boardSeconds(null), 20);
  assert.equal(boardSeconds('nonsense'), 20);
  assert.equal(boardSeconds('45'), 45);
  assert.equal(boardSeconds('1'), 5);
  assert.equal(boardSeconds('99999'), 300);
});

test('the smartboard wraps round in both directions and survives having nothing to show', () => {
  assert.equal(nextSlide(0, 3, 1), 1);
  assert.equal(nextSlide(2, 3, 1), 0);
  assert.equal(nextSlide(0, 3, -1), 2);
  assert.equal(nextSlide(5, 0, 1), 0);
});

test('week-over-week change reads plainly', () => {
  assert.equal(weekChange(8, 5), 'up 3 from the week before');
  assert.equal(weekChange(5, 8), 'down 3 from the week before');
  assert.equal(weekChange(5, 5), 'the same as the week before');
});
