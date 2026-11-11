// Product logos for log sources and dashboard groups (ui/src/utils/projectBrands.ts).
// Run: node --experimental-strip-types --test ui/tests/project-brands.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROJECT_BRANDS, DASHBOARD_SCOPE_BRANDS, findDashboardBrand, findProjectBrand } from '../src/utils/projectBrands.ts';

// The dashboard groups on the live site (logs.machinekinglabs.com, 2026-11-11), "Default" left out.
const LIVE_SCOPES: Array<[string, string]> = [
  ['Directors Palette', 'directors-palette'],
  ['Game', 'consequences-of-failure'],
  ['Hey Youre Hired', 'hey-youre-hired'],
  ['Homework Tree', 'homework-tree'],
  ['Main Suite', 'machine-king-labs'],
  ['Presidium', 'presidium'],
  ['Studio', 'machine-king-labs'],
];

test('every live dashboard group gets its product logo', () => {
  for (const [scope, slug] of LIVE_SCOPES) {
    assert.equal(findDashboardBrand(scope)?.slug, slug, scope);
    assert.equal(findDashboardBrand(scope.toLowerCase().replace(/ /g, '-'))?.slug, slug, scope + ' (slug form)');
    assert.equal(findDashboardBrand(scope.toLowerCase().replace(/ /g, '_'))?.slug, slug, scope + ' (underscore form)');
  }
});

test('the default group and unknown groups get no logo', () => {
  for (const scope of ['default', 'Default', '', null, undefined, 'something-else']) {
    assert.equal(findDashboardBrand(scope), undefined, String(scope));
  }
});

test('studio group names never match a log source', () => {
  for (const app of ['game', 'studio', 'main-suite', 'game-server', 'studio-api']) {
    assert.equal(findProjectBrand(app), undefined, app);
  }
});

test('known product names still match log sources', () => {
  assert.equal(findProjectBrand('lognog-api')?.slug, 'lognog');
  assert.equal(findProjectBrand('hey-youre-hired')?.slug, 'hey-youre-hired');
  assert.equal(findProjectBrand('presidium')?.slug, 'presidium');
});

test('every dashboard group points at a real product, and every logo file exists', () => {
  for (const slug of Object.values(DASHBOARD_SCOPE_BRANDS)) {
    assert.ok(PROJECT_BRANDS.some((b) => b.slug === slug), slug);
  }
  for (const b of PROJECT_BRANDS) {
    const file = fileURLToPath(new URL('../public' + b.logo, import.meta.url));
    assert.ok(existsSync(file), b.logo);
  }
});
