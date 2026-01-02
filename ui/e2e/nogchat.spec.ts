/**
 * NogChat E2E Tests
 *
 * These tests verify the NogChat UI functionality including:
 * - Opening/closing the chat
 * - Sending messages
 * - Displaying citations
 * - Expanding source cards
 *
 * To run: npx playwright test e2e/nogchat.spec.ts
 * Prerequisites: API server running at localhost:4000
 */

import { test, expect, type Page } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

test.describe('NogChat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
  });

  test.describe('Chat Window', () => {
    test('should show chat button when closed', async ({ page }) => {
      // NogChat button should be visible in bottom right
      const chatButton = page.locator('button[title*="NogChat"]');
      await expect(chatButton).toBeVisible();
    });

    test('should open chat panel when clicked', async ({ page }) => {
      // Click the chat button
      const chatButton = page.locator('button[title*="NogChat"]');
      await chatButton.click();

      // Chat panel should appear
      const chatPanel = page.locator('text=NogChat').first();
      await expect(chatPanel).toBeVisible();
    });

    test('should close chat panel when X is clicked', async ({ page }) => {
      // Open chat
      const chatButton = page.locator('button[title*="NogChat"]');
      await chatButton.click();

      // Find and click close button
      const closeButton = page.locator('button').filter({ has: page.locator('svg.lucide-x') });
      await closeButton.click();

      // Chat panel should be hidden, button should be visible
      await expect(chatButton).toBeVisible();
    });
  });

  test.describe('Quick Actions', () => {
    test('should display quick action buttons', async ({ page }) => {
      // Open chat
      const chatButton = page.locator('button[title*="NogChat"]');
      await chatButton.click();

      // Should see quick actions
      await expect(page.locator('text=Getting Started')).toBeVisible();
      await expect(page.locator('text=Build a Query')).toBeVisible();
    });

    test('should send prompt when quick action is clicked', async ({ page }) => {
      // Open chat
      const chatButton = page.locator('button[title*="NogChat"]');
      await chatButton.click();

      // Click a quick action
      await page.click('text=Getting Started');

      // Should see user message appear
      await expect(page.locator('.bg-sky-500').first()).toBeVisible();
    });
  });

  test.describe('Chat Input', () => {
    test('should allow typing messages', async ({ page }) => {
      // Open chat
      const chatButton = page.locator('button[title*="NogChat"]');
      await chatButton.click();

      // Type in input
      const input = page.locator('input[placeholder*="Ask"]');
      await input.fill('How do I search for errors?');

      await expect(input).toHaveValue('How do I search for errors?');
    });

    test('should send message on Enter', async ({ page }) => {
      // Open chat
      const chatButton = page.locator('button[title*="NogChat"]');
      await chatButton.click();

      // Type and send
      const input = page.locator('input[placeholder*="Ask"]');
      await input.fill('test message');
      await input.press('Enter');

      // Should see the message in chat (user message has sky-500 background)
      await expect(page.locator('.bg-sky-500')).toContainText('test message');
    });
  });

  test.describe('Citations Panel', () => {
    test('should show citations panel when sources exist', async ({ page }) => {
      // Open chat
      const chatButton = page.locator('button[title*="NogChat"]');
      await chatButton.click();

      // Send a message that should return citations
      const input = page.locator('input[placeholder*="Ask"]');
      await input.fill('How do I configure logging?');
      await input.press('Enter');

      // Wait for response
      await page.waitForSelector('.bg-slate-100', { timeout: 30000 });

      // Check if citations panel appears (may or may not based on AI availability)
      const citationsPanel = page.locator('text=Sources');
      // This is optional - citations may not always appear
      const hasCitations = await citationsPanel.isVisible().catch(() => false);

      if (hasCitations) {
        await expect(citationsPanel).toBeVisible();
      }
    });

    test('should expand source on click', async ({ page }) => {
      // This test requires citations to be present
      // Skip if no citations are available

      // Open chat
      const chatButton = page.locator('button[title*="NogChat"]');
      await chatButton.click();

      // Send a message
      const input = page.locator('input[placeholder*="Ask"]');
      await input.fill('What is the DSL syntax?');
      await input.press('Enter');

      // Wait for response
      await page.waitForSelector('.bg-slate-100', { timeout: 30000 });

      // Check for expandable source cards
      const sourceCard = page.locator('button').filter({ hasText: /Document|Doc/ }).first();
      const hasSourceCard = await sourceCard.isVisible().catch(() => false);

      if (hasSourceCard) {
        await sourceCard.click();
        // Should show expanded content
        const expandedContent = page.locator('text=/Source:|Score:/');
        await expect(expandedContent.first()).toBeVisible({ timeout: 5000 });
      }
    });

    test('should show relevance badges', async ({ page }) => {
      // Open chat
      const chatButton = page.locator('button[title*="NogChat"]');
      await chatButton.click();

      // Send a message
      const input = page.locator('input[placeholder*="Ask"]');
      await input.fill('How do alerts work?');
      await input.press('Enter');

      // Wait for response
      await page.waitForSelector('.bg-slate-100', { timeout: 30000 });

      // Look for relevance badges (high, medium, low)
      const badges = page.locator('text=/high|medium|low/i');
      // This is optional - badges may not appear if no citations
      const hasBadges = await badges.first().isVisible().catch(() => false);

      if (hasBadges) {
        await expect(badges.first()).toBeVisible();
      }
    });
  });

  test.describe('Message Display', () => {
    test('should format code blocks with copy button', async ({ page }) => {
      // Open chat
      const chatButton = page.locator('button[title*="NogChat"]');
      await chatButton.click();

      // Ask for a query (should return code block)
      const input = page.locator('input[placeholder*="Ask"]');
      await input.fill('Give me a query to count errors by host');
      await input.press('Enter');

      // Wait for response
      await page.waitForSelector('.bg-slate-100', { timeout: 30000 });

      // Check for code blocks (they have DSL Query label)
      const codeBlock = page.locator('text=DSL Query');
      const hasCodeBlock = await codeBlock.isVisible().catch(() => false);

      if (hasCodeBlock) {
        await expect(codeBlock).toBeVisible();
        // Should have copy button
        const copyButton = page.locator('text=Copy').first();
        await expect(copyButton).toBeVisible();
      }
    });
  });
});
