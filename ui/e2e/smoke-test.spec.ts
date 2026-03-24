import { test, expect } from '@playwright/test';

const BASE = 'http://localhost';

test.setTimeout(45000);

let authTokens: any = null;

test.describe('Post-Refactor Smoke Test', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.request.post(`${BASE}/api/auth/login`, {
      data: { username: 'admin', password: 'admin' },
    });
    authTokens = await response.json();
    await page.close();
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((tokens) => {
      localStorage.setItem('lognog_access_token', tokens.accessToken);
      localStorage.setItem('lognog_refresh_token', tokens.refreshToken);
    }, authTokens);
  });

  const dismissOnboarding = async (page: any) => {
    const skip = page.locator('text=/Skip Setup/i').first();
    if (await skip.isVisible({ timeout: 2000 }).catch(() => false)) await skip.click();
    // Also try closing via X button
    const closeBtn = page.locator('[class*="fixed inset-0"] button:has-text("×"), [class*="fixed inset-0"] button[aria-label="Close"]').first();
    if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) await closeBtn.click();
    await page.waitForTimeout(500);
  };

  const loadPage = async (page: any, path: string) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
  };

  test('01. Search page', async ({ page }) => {
    await loadPage(page, '/search');
    await dismissOnboarding(page);
    await page.screenshot({ path: 'e2e/screenshots/01-search.png', fullPage: true });
  });

  test('02. Dashboards list', async ({ page }) => {
    await loadPage(page, '/dashboards');
    await dismissOnboarding(page);
    await page.screenshot({ path: 'e2e/screenshots/02-dashboards.png', fullPage: true });
  });

  test('03. Open a dashboard', async ({ page }) => {
    await loadPage(page, '/dashboards');
    await dismissOnboarding(page);
    const link = page.locator('a[href*="/dashboards/"]').first();
    if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
      await link.click({ force: true });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2500);
      await page.screenshot({ path: 'e2e/screenshots/03-dashboard-detail.png', fullPage: true });
    }
  });

  test('04. Alerts page', async ({ page }) => {
    await loadPage(page, '/alerts');
    await dismissOnboarding(page);
    await page.screenshot({ path: 'e2e/screenshots/04-alerts.png', fullPage: true });
  });

  // Settings tabs
  const settingsTabs = [
    { id: '05a', tab: 'Preferences', exact: false },
    { id: '05b', tab: 'Account', exact: false },
    { id: '05c', tab: 'Notifications', exact: false },
    { id: '05d', tab: 'Users', exact: true },
    { id: '05e', tab: 'Data', exact: true },
    { id: '05f', tab: 'GeoIP', exact: false },
    { id: '05g', tab: 'System', exact: false },
    { id: '05h', tab: 'AI', exact: true },
  ];

  for (const { id, tab, exact } of settingsTabs) {
    test(`${id}. Settings - ${tab}`, async ({ page }) => {
      await loadPage(page, '/settings');
      await dismissOnboarding(page);

      if (tab !== 'Preferences') {
        const btn = exact
          ? page.getByRole('button', { name: new RegExp(`^${tab}$`) })
          : page.getByRole('button', { name: tab });
        if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await btn.click({ force: true });
          await page.waitForTimeout(1500);
        }
      }

      await page.screenshot({ path: `e2e/screenshots/${id}-settings-${tab.toLowerCase()}.png`, fullPage: true });
    });
  }

  test('06a. Docs - Getting Started', async ({ page }) => {
    await loadPage(page, '/docs');
    await dismissOnboarding(page);
    await page.screenshot({ path: 'e2e/screenshots/06a-docs-getting-started.png', fullPage: true });
  });

  test('06b. Docs - Query Language', async ({ page }) => {
    await loadPage(page, '/docs');
    await dismissOnboarding(page);
    const btn = page.locator('button, a').filter({ hasText: 'Query Language' }).first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click({ force: true });
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: 'e2e/screenshots/06b-docs-query-language.png', fullPage: true });
  });

  test('06c. Docs - API Reference', async ({ page }) => {
    await loadPage(page, '/docs');
    await dismissOnboarding(page);
    const btn = page.locator('button, a').filter({ hasText: 'API Reference' }).first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click({ force: true });
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: 'e2e/screenshots/06c-docs-api-reference.png', fullPage: true });
  });

  test('07. Reports page', async ({ page }) => {
    await loadPage(page, '/reports');
    await dismissOnboarding(page);
    await page.screenshot({ path: 'e2e/screenshots/07-reports.png', fullPage: true });
  });

  test('08. Saved Searches', async ({ page }) => {
    await loadPage(page, '/saved-searches');
    await dismissOnboarding(page);
    await page.screenshot({ path: 'e2e/screenshots/08-saved-searches.png', fullPage: true });
  });

  test('09. Agent page', async ({ page }) => {
    await loadPage(page, '/agent');
    await dismissOnboarding(page);
    await page.screenshot({ path: 'e2e/screenshots/09-agent.png', fullPage: true });
  });
});
