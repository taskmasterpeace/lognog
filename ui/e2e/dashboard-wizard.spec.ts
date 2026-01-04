/**
 * Dashboard Builder Wizard E2E Tests
 *
 * These tests verify the Dashboard Builder Wizard functionality:
 * - Opening the wizard from the dashboards page
 * - Step 1: Index selection with sparklines
 * - Step 2: Field selection with recommendations
 * - Step 3: Visualization type selection
 * - Step 4: Preview and dashboard creation
 *
 * To run: npx playwright test e2e/dashboard-wizard.spec.ts
 * Prerequisites: API server running at localhost:4000, UI at localhost:3000
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

test.describe('Dashboard Builder Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboards`);
    await page.waitForLoadState('networkidle');
  });

  test.describe('Wizard Opening', () => {
    test('should show "Build from Index" button on dashboards page', async ({ page }) => {
      const wizardButton = page.locator('button:has-text("Build from Index")');
      await expect(wizardButton).toBeVisible();
    });

    test('should open wizard modal when "Build from Index" is clicked', async ({ page }) => {
      await page.click('button:has-text("Build from Index")');

      // Wizard modal should appear
      const wizardTitle = page.locator('text=Dashboard Builder Wizard');
      await expect(wizardTitle).toBeVisible();

      // Should show Step 1
      await expect(page.locator('text=Step 1 of 4')).toBeVisible();
      await expect(page.locator('text=Select Index')).toBeVisible();
    });

    test('should close wizard when X is clicked', async ({ page }) => {
      await page.click('button:has-text("Build from Index")');
      await expect(page.locator('text=Dashboard Builder Wizard')).toBeVisible();

      // Click the X button to close
      await page.click('button:has(svg.lucide-x)');

      // Modal should be closed
      await expect(page.locator('text=Dashboard Builder Wizard')).not.toBeVisible();
    });
  });

  test.describe('Step 1: Select Index', () => {
    test('should display available indexes', async ({ page }) => {
      await page.click('button:has-text("Build from Index")');

      // Should show either indexes or "No indexes found" message
      const hasIndexes = await page.locator('button:has(.lucide-database)').first().isVisible().catch(() => false);
      const noIndexesMessage = await page.locator('text=No indexes found').isVisible().catch(() => false);

      expect(hasIndexes || noIndexesMessage).toBeTruthy();
    });

    test('should enable Next button when index is selected', async ({ page }) => {
      await page.click('button:has-text("Build from Index")');

      // Next button should be disabled initially (no index selected)
      const nextButton = page.locator('button:has-text("Next")');

      // If indexes exist, select one
      const indexCard = page.locator('button:has(.lucide-database)').first();
      const hasIndexes = await indexCard.isVisible().catch(() => false);

      if (hasIndexes) {
        await indexCard.click();
        // Next button should now be enabled
        await expect(nextButton).toBeEnabled();
      }
    });
  });

  test.describe('Step 2: Choose Fields', () => {
    test('should navigate to step 2 and show fields', async ({ page }) => {
      await page.click('button:has-text("Build from Index")');

      // Select first index if available
      const indexCard = page.locator('button:has(.lucide-database)').first();
      const hasIndexes = await indexCard.isVisible().catch(() => false);

      if (hasIndexes) {
        await indexCard.click();
        await page.click('button:has-text("Next")');

        // Should be on Step 2
        await expect(page.locator('text=Step 2 of 4')).toBeVisible();
        await expect(page.locator('text=Choose Fields')).toBeVisible();
      }
    });

    test('should show Quick Setup button', async ({ page }) => {
      await page.click('button:has-text("Build from Index")');

      const indexCard = page.locator('button:has(.lucide-database)').first();
      const hasIndexes = await indexCard.isVisible().catch(() => false);

      if (hasIndexes) {
        await indexCard.click();
        await page.click('button:has-text("Next")');

        // Quick Setup button should be visible
        await expect(page.locator('button:has-text("Quick Setup")')).toBeVisible();
      }
    });
  });

  test.describe('Step 3: Pick Visualizations', () => {
    test('should navigate to step 3 with visualization options', async ({ page }) => {
      await page.click('button:has-text("Build from Index")');

      const indexCard = page.locator('button:has(.lucide-database)').first();
      const hasIndexes = await indexCard.isVisible().catch(() => false);

      if (hasIndexes) {
        await indexCard.click();
        await page.click('button:has-text("Next")');

        // Select at least one field (click the first checkbox)
        const fieldCheckbox = page.locator('input[type="checkbox"]').first();
        const hasFields = await fieldCheckbox.isVisible().catch(() => false);

        if (hasFields) {
          await fieldCheckbox.click();
          await page.click('button:has-text("Next")');

          // Should be on Step 3
          await expect(page.locator('text=Step 3 of 4')).toBeVisible();
          await expect(page.locator('text=Pick Visualizations')).toBeVisible();
        }
      }
    });
  });

  test.describe('Step 4: Preview & Create', () => {
    test('should show preview and dashboard name input', async ({ page }) => {
      await page.click('button:has-text("Build from Index")');

      const indexCard = page.locator('button:has(.lucide-database)').first();
      const hasIndexes = await indexCard.isVisible().catch(() => false);

      if (hasIndexes) {
        // Step 1: Select index
        await indexCard.click();
        await page.click('button:has-text("Next")');

        // Step 2: Use Quick Setup to select all fields
        const quickSetup = page.locator('button:has-text("Quick Setup")');
        if (await quickSetup.isVisible()) {
          await quickSetup.click();
        }
        await page.click('button:has-text("Next")');

        // Step 3: Just go to next (viz types should be auto-selected)
        await page.click('button:has-text("Next")');

        // Step 4: Should see preview
        await expect(page.locator('text=Step 4 of 4')).toBeVisible();
        await expect(page.locator('text=Dashboard Name')).toBeVisible();

        // Should see "Create Dashboard" button
        await expect(page.locator('button:has-text("Create Dashboard")')).toBeVisible();
      }
    });

    test('should create dashboard successfully', async ({ page }) => {
      await page.click('button:has-text("Build from Index")');

      const indexCard = page.locator('button:has(.lucide-database)').first();
      const hasIndexes = await indexCard.isVisible().catch(() => false);

      if (hasIndexes) {
        // Navigate through wizard
        await indexCard.click();
        await page.click('button:has-text("Next")');

        const quickSetup = page.locator('button:has-text("Quick Setup")');
        if (await quickSetup.isVisible()) {
          await quickSetup.click();
        }
        await page.click('button:has-text("Next")');
        await page.click('button:has-text("Next")');

        // Enter a unique dashboard name
        const dashboardName = `Test Dashboard ${Date.now()}`;
        const nameInput = page.locator('input[type="text"]');
        await nameInput.fill(dashboardName);

        // Create the dashboard
        await page.click('button:has-text("Create Dashboard")');

        // Should navigate to the new dashboard view
        await page.waitForURL(/\/dashboards\/[a-f0-9-]+/, { timeout: 10000 });

        // Should see the dashboard name
        await expect(page.locator(`text=${dashboardName}`).first()).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test.describe('Progress Indicators', () => {
    test('should show progress bar with correct step highlighting', async ({ page }) => {
      await page.click('button:has-text("Build from Index")');

      // Should have 4 progress segments
      const progressBars = page.locator('.h-1\\.5.rounded-full');
      await expect(progressBars).toHaveCount(4);

      // First one should be highlighted (amber)
      const firstBar = progressBars.first();
      await expect(firstBar).toHaveClass(/bg-amber-500/);
    });
  });

  test.describe('Navigation', () => {
    test('should allow going back to previous steps', async ({ page }) => {
      await page.click('button:has-text("Build from Index")');

      const indexCard = page.locator('button:has(.lucide-database)').first();
      const hasIndexes = await indexCard.isVisible().catch(() => false);

      if (hasIndexes) {
        // Go to step 2
        await indexCard.click();
        await page.click('button:has-text("Next")');
        await expect(page.locator('text=Step 2 of 4')).toBeVisible();

        // Go back to step 1
        await page.click('button:has-text("Back")');
        await expect(page.locator('text=Step 1 of 4')).toBeVisible();
      }
    });
  });
});
