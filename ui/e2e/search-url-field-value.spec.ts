import { test, expect } from '@playwright/test';

/**
 * A Search link whose query ends on a field value (e.g. "severity<=3", which is
 * what LogNog Weekly and Home drill-downs open) used to pin the page in an
 * endless render loop: the autocomplete re-stored cached field values as a new
 * object every render, which re-ran its own effect.
 *
 * Run against a production build (`vite build && vite preview`), since dev
 * StrictMode adds its own double-mount noise:
 *   E2E_BASE_URL=http://localhost:4173 E2E_USER=... E2E_PASS=... npx playwright test e2e/search-url-field-value.spec.ts
 */
const BASE = process.env.E2E_BASE_URL || 'http://localhost';
const USER = process.env.E2E_USER || 'admin';
const PASS = process.env.E2E_PASS || 'admin';

test.setTimeout(60000);

test('a /search link ending on a field value settles instead of looping', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'uses the Chrome DevTools Performance domain');

  const login = await page.request.post(`${BASE}/api/auth/login`, { data: { username: USER, password: PASS } });
  expect(login.ok()).toBeTruthy();
  const tokens = await login.json();
  await context.addInitScript(({ a, r }) => {
    localStorage.setItem('lognog_access_token', a);
    localStorage.setItem('lognog_refresh_token', r);
    localStorage.setItem('lognog_wizard_dont_show', 'true');
  }, { a: tokens.accessToken, r: tokens.refreshToken });

  const loopWarnings: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('Maximum update depth')) loopWarnings.push(m.text());
  });

  await page.goto(`${BASE}/search?q=${encodeURIComponent('search severity<=3')}`);
  await expect(page.getByText('Searching logs...')).toHaveCount(0, { timeout: 20000 });
  // Field values load after a 300 ms debounce; give the loop time to start.
  await page.waitForTimeout(3000);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const taskSeconds = async () =>
    (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')!.value;
  const before = await taskSeconds();
  await page.waitForTimeout(3000);
  const busy = (await taskSeconds()) - before;

  expect(loopWarnings).toHaveLength(0);
  // An idle page uses a few ms per second; the loop used all 3 seconds.
  expect(busy).toBeLessThan(1);
});
