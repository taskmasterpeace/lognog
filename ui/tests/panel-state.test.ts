// Dashboard panel rules (ui/src/components/dashboard/panelState.ts).
// Run: node --experimental-strip-types --test ui/tests/panel-state.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  showFirstLoadSpinner, isRefreshingInPlace, seriesColors, mainColor, isBusyError, LOGNOG_HONEY,
} from '../src/components/dashboard/panelState.ts';

test('spinner only before the first answer', () => {
  assert.equal(showFirstLoadSpinner({ loading: true }), true);
  assert.equal(showFirstLoadSpinner({ loading: true, loadedOnce: true }), false);
  assert.equal(showFirstLoadSpinner({ loading: false, loadedOnce: true }), false);
});

test('a refresh or new time range over shown numbers is marked as loading (dimmed)', () => {
  assert.equal(isRefreshingInPlace({ loading: true, loadedOnce: true }), true);
  assert.equal(isRefreshingInPlace({ loading: true }), false);
  assert.equal(isRefreshingInPlace({ loading: false, loadedOnce: true }), false);
});

test('a dashboard accent leads the series colours; none keeps the palette', () => {
  const palette = ['#C8862B', '#06B6D4', '#16A34A'];
  assert.deepEqual(seriesColors(undefined, palette), palette);
  assert.deepEqual(seriesColors('#06b6d4', palette), ['#06b6d4', '#C8862B', '#16A34A']);
  assert.equal(mainColor(undefined), LOGNOG_HONEY);
  assert.equal(mainColor('#00BCD4'), '#00BCD4');
});

test('only a 429 counts as busy', () => {
  assert.equal(isBusyError('Too many requests'), true);
  assert.equal(isBusyError('Query failed: syntax error'), false);
});
