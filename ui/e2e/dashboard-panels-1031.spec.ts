/**
 * Dashboard panel behaviour from Robert's 10-31 walkthrough (PR #47).
 *
 *  - A refresh or a new time range keeps the old numbers on screen, dimmed,
 *    with no spinner; the spinner is for the first load only.
 *  - A 429 from search is retried quietly, at most BUSY_RETRY_LIMIT (3) times.
 *  - A fullscreen panel keeps the dashboard's accent colour.
 *  - Panel buttons are always shown on touch screens.
 *  - Home's "Last check missed" warning shows on phones.
 *
 * Needs a running LogNog UI + API with the product dashboards (prod, or a copy
 * of prod's SQLite after scripts/dashboards/2026-10-31-real-use.cjs):
 *   E2E_BASE_URL=http://localhost:3111 E2E_USER=admin E2E_PASSWORD=... npx playwright test e2e/dashboard-panels-1031.spec.ts
 * or E2E_TOKEN_URL=<url returning {a, r}> instead of a password.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const USER = process.env.E2E_USER || 'admin';
const PASSWORD = process.env.E2E_PASSWORD || 'admin';

const HYH_REAL_USE = 'be45c6a6-cf41-4d2f-bb80-8180d65a5c9f';
// The fullscreen test gives the dashboard a magenta accent (no default palette colour is near it).
const TEST_ACCENT = '#FF00FF';
const TEST_ACCENT_RGB = [0xff, 0x00, 0xff];
const DP_DAILY = '8b747afe-77e1-4cec-9d4e-905a3c90fb8a';

let tokens: { a: string; r: string };

test.setTimeout(120_000);

test.beforeAll(async ({ request }) => {
  if (process.env.E2E_TOKEN_URL) {
    tokens = await (await request.get(process.env.E2E_TOKEN_URL)).json();
    return;
  }
  const res = await request.post(`${BASE_URL}/api/auth/login`, { data: { username: USER, password: PASSWORD } });
  expect(res.ok(), `login as ${USER} failed (${res.status()})`).toBeTruthy();
  const t = await res.json();
  tokens = { a: t.accessToken, r: t.refreshToken };
});

async function signIn(context: BrowserContext) {
  await context.addInitScript(({ a, r }) => {
    localStorage.setItem('lognog_access_token', a);
    localStorage.setItem('lognog_refresh_token', r);
    localStorage.setItem('lognog_wizard_dont_show', 'true');
    localStorage.setItem('lognog_time_range', '-24h');
  }, tokens);
}

const panelBodies = (page: Page) => page.locator('div.group [aria-busy]');

async function openDashboard(page: Page, id: string) {
  await page.goto(`${BASE_URL}/dashboards/${id}`);
  await expect(panelBodies(page).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('div.group [aria-busy="true"]')).toHaveCount(0, { timeout: 60_000 });
}

test('a new time range dims the old numbers instead of blanking them', async ({ page, context }) => {
  await signIn(context);
  await openDashboard(page, DP_DAILY);
  const total = await panelBodies(page).count();
  expect(total).toBeGreaterThan(3);

  // Hold every search for 2 s so the in-between state can be seen.
  await page.route('**/api/search/query', async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });
  await page.locator('button[title="Last 24 hours"]').click();
  await page.getByRole('button', { name: 'Last 1 hour' }).first().click();

  const busy = page.locator('div.group [aria-busy="true"]');
  await expect(busy).toHaveCount(total, { timeout: 5_000 });
  expect(await page.locator('div.group [aria-busy="true"].opacity-50').count()).toBe(total);
  // No first-load spinner over numbers that were already on screen.
  expect(await page.locator('div.group [aria-busy] .animate-spin').count()).toBe(0);

  await expect(busy).toHaveCount(0, { timeout: 60_000 });
  expect(await page.locator('div.group [aria-busy].opacity-50').count()).toBe(0);
});

test('a busy (429) search retries quietly, at most 3 times per panel', async ({ page, context }) => {
  await signIn(context);
  await openDashboard(page, DP_DAILY);
  const total = await panelBodies(page).count();

  let calls = 0;
  await page.route('**/api/search/query', async (route) => {
    calls++;
    await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Too many requests' }) });
  });
  await page.locator('button[title="Last 24 hours"]').click();
  await page.getByRole('button', { name: 'Last 1 hour' }).first().click();

  // Retries are 4–8 s apart: three of them finish inside ~25 s.
  await expect(page.getByText(/too many requests/i).first()).toBeVisible({ timeout: 40_000 });
  await page.waitForTimeout(10_000);
  expect(calls).toBeGreaterThanOrEqual(total * 2);
  expect(calls).toBeLessThanOrEqual(total * 4);
});

test('a fullscreen panel keeps the dashboard accent', async ({ page, context }) => {
  await signIn(context);
  await page.route(`**/api/dashboards/${HYH_REAL_USE}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: { ...body, accent_color: TEST_ACCENT } });
  });
  await openDashboard(page, HYH_REAL_USE);
  const card = page.locator('div.group', { has: page.getByText('Site up? (response time)') }).first();
  await card.hover();
  await card.locator('button[title="More actions"]').click();
  await page.getByRole('button', { name: 'Fullscreen' }).click();
  await expect(page.locator('button[title="Exit fullscreen"]')).toBeVisible();
  await page.waitForTimeout(1500); // chart animation

  const accentPixels = await page.evaluate((rgb) => {
    const overlay = document.querySelector('button[title="Exit fullscreen"]')?.closest('.modal-overlay');
    if (!overlay) return -1;
    let n = 0;
    for (const c of Array.from(overlay.querySelectorAll('canvas'))) {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - rgb[0]) < 24 && Math.abs(d[i + 1] - rgb[1]) < 24 && Math.abs(d[i + 2] - rgb[2]) < 24 && d[i + 3] > 200) n++;
      }
    }
    return n;
  }, TEST_ACCENT_RGB);
  expect(accentPixels, 'line drawn in the dashboard accent').toBeGreaterThan(50);
});

test('mouse screen: panel buttons take no room until hover or keyboard focus', async ({ page, context }) => {
  await signIn(context);
  await openDashboard(page, DP_DAILY);
  const refresh = page.locator('div.group button[title="Refresh"]').first();
  const rowWidth = () => refresh.evaluate((b) => b.parentElement!.getBoundingClientRect().width);
  await page.mouse.move(1, 1);
  expect(await rowWidth(), 'collapsed before hover').toBeLessThan(2);

  await page.locator('div.group').first().hover();
  await expect.poll(rowWidth, { message: 'shown on hover' }).toBeGreaterThan(40);

  await page.mouse.move(1, 1);
  await expect.poll(rowWidth).toBeLessThan(2);
  await refresh.focus();
  await expect.poll(rowWidth, { message: 'shown on keyboard focus' }).toBeGreaterThan(40);
});

test.describe('touch screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('panel buttons are always shown', async ({ page, context }) => {
    await signIn(context);
    await openDashboard(page, DP_DAILY);
    const refresh = page.locator('div.group button[title="Refresh"]').first();
    await expect(refresh).toBeAttached();
    // The buttons' row: full width and fully opaque without any hover.
    const row = await refresh.evaluate((b) => {
      const el = b.parentElement!;
      return { width: el.getBoundingClientRect().width, opacity: getComputedStyle(el).opacity };
    });
    expect(row.opacity).toBe('1');
    expect(row.width).toBeGreaterThan(40);
  });

  test("Home's missed-check warning shows on a phone", async ({ page, context }) => {
    await signIn(context);
    const first = page.waitForResponse((r) => r.url().includes('/api/stats/home') && r.ok(), { timeout: 60_000 });
    await page.goto(`${BASE_URL}/home`);
    await first;
    const check = page.locator('button[title="Check again now"]');
    await expect(page.getByText(/Updated \d/)).toBeHidden(); // desktop-only

    await page.route('**/api/stats/home', (route) => route.fulfill({ status: 500, body: 'down' }));
    await check.click();
    await expect(page.getByText(/Last check missed, showing/)).toBeVisible({ timeout: 30_000 });
  });
});
