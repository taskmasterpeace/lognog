// Table column labels in panel options (ui/src/components/dashboard/panelFormat.ts).
// Run: node --experimental-strip-types --test ui/tests/panel-format.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPanelFormat } from '../src/components/dashboard/panelFormat.ts';

test('columnLabels are read from options (object or JSON string)', () => {
  const opts = { format: { columnLabels: { product: 'Machine', ping_ms: 'Ping (ms)' } } };
  assert.deepEqual(readPanelFormat(opts).columnLabels, { product: 'Machine', ping_ms: 'Ping (ms)' });
  assert.deepEqual(readPanelFormat(JSON.stringify(opts)).columnLabels, { product: 'Machine', ping_ms: 'Ping (ms)' });
});

test('non-string labels are dropped; no labels = undefined', () => {
  assert.deepEqual(readPanelFormat({ format: { columnLabels: { a: 'A', b: 3 } } }).columnLabels, { a: 'A' });
  assert.equal(readPanelFormat({ format: {} }).columnLabels, undefined);
});
