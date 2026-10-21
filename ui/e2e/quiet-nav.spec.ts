/**
 * Quiet mode sidebar (release 2026-10-21).
 *
 * The main group shows only the daily pages; everything else is behind "More",
 * which is collapsed by default and remembers open/closed per browser. No page
 * is removed: every route still loads by URL and has a link under More.
 *
 * Needs a running LogNog UI + API (any backend):
 *   E2E_BASE_URL=http://localhost:3000 E2E_USER=admin E2E_PASSWORD=... npx playwright test e2e/quiet-nav.spec.ts
 *
 * The expected lists are written out here on purpose (not imported from
 * src/nav/navItems.ts), so the test is an independent check of the sidebar.
 * When Home (/home) joins the main group, add it to MAIN below.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const USER = process.env.E2E_USER || 'admin';
const PASSWORD = process.env.E2E_PASSWORD || 'admin';

const MAIN: Array<[string, string]> = [
  ['Search', '/search'],
  ['Dashboards', '/dashboards'],
  ['Alerts', '/alerts'],
  ['Data Sources', '/data-sources'],
  ['Reports', '/reports'],
  ['Settings', '/settings'],
];

const MORE: Array<[string, string]> = [
  ['Anomaly Detection', '/anomaly'],
  ['Synthetic', '/synthetic'],
  ['Saved Searches', '/saved-searches'],
  ['Analytics', '/stats'],
  ['Data Models', '/cim'],
  ['Knowledge', '/knowledge'],
  ['Assets', '/assets'],
  ['Identities', '/identities'],
  ['AI Agent', '/agent'],
  ['AI Onboarding', '/onboarding'],
  ['User Guide', '/guide'],
  ['Documentation', '/docs'],
];

let tokens: { accessToken: string; refreshToken: string };

test.setTimeout(90_000);

test.beforeAll(async ({ request }) => {
  const res = await request.post(`${BASE_URL}/api/auth/login`, { data: { username: USER, password: PASSWORD } });
  expect(res.ok(), `login as ${USER} failed (${res.status()})`).toBeTruthy();
  tokens = await res.json();
});

async function signIn(context: BrowserContext, extraInit?: () => void) {
  await context.addInitScript(({ a, r }) => {
    localStorage.setItem('lognog_access_token', a);
    localStorage.setItem('lognog_refresh_token', r);
    localStorage.setItem('lognog_wizard_dont_show', 'true');
  }, { a: tokens.accessToken, r: tokens.refreshToken });
  if (extraInit) await context.addInitScript(extraInit);
}

const sidebar = (page: Page) => page.locator('aside nav');
const moreButton = (page: Page) => sidebar(page).getByRole('button', { name: /More/ });

async function visibleLinks(page: Page): Promise<Array<[string, string]>> {
  const links = sidebar(page).locator('a:visible');
  const n = await links.count();
  const out: Array<[string, string]> = [];
  for (let i = 0; i < n; i++) {
    const a = links.nth(i);
    out.push([(await a.innerText()).trim(), new URL((await a.getAttribute('href')) ?? '', BASE_URL).pathname]);
  }
  return out;
}

async function open(page: Page, path: string) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
  await expect(sidebar(page)).toBeVisible({ timeout: 20_000 });
}

test.describe('desktop 1440x900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test('main group shows only the six daily pages; More is closed with a count', async ({ page }) => {
    await open(page, '/search');
    expect(await visibleLinks(page)).toEqual(MAIN);
    await expect(moreButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(moreButton(page)).toContainText(String(MORE.length));
  });

  test('More opens to every other page, each with its link', async ({ page }) => {
    await open(page, '/search');
    await moreButton(page).click();
    await expect(moreButton(page)).toHaveAttribute('aria-expanded', 'true');
    expect(await visibleLinks(page)).toEqual([...MAIN, ...MORE]);
  });

  test('More remembers open and closed across a reload', async ({ page }) => {
    await open(page, '/search');
    await moreButton(page).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('nav-group-more'))).toBe('true');
    await page.reload();
    await expect(sidebar(page)).toBeVisible();
    await expect(moreButton(page)).toHaveAttribute('aria-expanded', 'true');
    expect(await visibleLinks(page)).toEqual([...MAIN, ...MORE]);

    await moreButton(page).click();
    await page.reload();
    await expect(sidebar(page)).toBeVisible();
    await expect(moreButton(page)).toHaveAttribute('aria-expanded', 'false');
    expect(await visibleLinks(page)).toEqual(MAIN);
  });

  test('every page still loads by URL and the sidebar marks it, even when it lives in More', async ({ page }) => {
    for (const [label, path] of [...MAIN, ...MORE]) {
      await open(page, path);
      expect(new URL(page.url()).pathname, `${path} redirected`).toBe(path);
      await expect(sidebar(page).locator('a[aria-current="page"]'), `${path} not marked`).toHaveText(label);
      await expect(page.locator('main'), `${path} content`).not.toBeEmpty();
      await expect(page.getByText('Something went wrong'), `${path} crashed`).toHaveCount(0);
    }
    // More stayed closed the whole time; the More page you're on showed under it.
    await expect(moreButton(page)).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('blocked storage', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('More still opens and closes when the browser refuses storage for it', async ({ context, page }) => {
    await signIn(context, () => {
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (k: string) {
        if (k.startsWith('nav-group')) throw new DOMException('blocked', 'SecurityError');
        return get.call(this, k);
      };
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k.startsWith('nav-group')) throw new DOMException('blocked', 'SecurityError');
        return set.call(this, k, v);
      };
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await open(page, '/search');
    expect(await visibleLinks(page)).toEqual(MAIN);
    await moreButton(page).click();
    expect(await visibleLinks(page)).toEqual([...MAIN, ...MORE]);
    await moreButton(page).click();
    expect(await visibleLinks(page)).toEqual(MAIN);
    expect(errors.filter((m) => /blocked/.test(m))).toEqual([]);
  });
});

test.describe('phone 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test('the phone menu shows the same six, More opens, and a More page closes the menu', async ({ page }) => {
    await page.goto(`${BASE_URL}/search`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(sidebar(page)).toBeInViewport();
    expect(await visibleLinks(page)).toEqual(MAIN);

    await moreButton(page).click();
    expect(await visibleLinks(page)).toEqual([...MAIN, ...MORE]);

    await sidebar(page).getByRole('link', { name: 'Identities' }).click();
    await expect(page).toHaveURL(/\/identities$/);
    await expect(sidebar(page)).not.toBeInViewport();
  });
});
