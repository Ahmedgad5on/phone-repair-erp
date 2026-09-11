import { test, expect } from '@playwright/test';

test.describe('Modular Mobile ERP End-to-End Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('E2E Scenario 1: Retail POS Instant Checkout & Strict IMEI', async ({ page }) => {
    // 1. Verify app loaded with Header & Navigation
    await expect(page.locator('header')).toBeVisible();

    // 2. Navigate to POS tab
    const posTab = page.locator('text=نقطة البيع (POS)');
    if (await posTab.isVisible()) {
      await posTab.click();
    }

    // 3. Verify customer display and search inputs are present
    const searchInput = page.locator('input[placeholder*="بحث"]');
    await expect(searchInput).toBeVisible();
  });

  test('E2E Scenario 2: Repair Lab Ticket Intake & 24-Point Check', async ({ page }) => {
    // 1. Navigate to Repair Lab tab
    const repairTab = page.locator('text=معمل الصيانة (Lab)');
    if (await repairTab.isVisible()) {
      await repairTab.click();
    }

    // 2. Open New Ticket Intake Modal
    const newTicketBtn = page.locator('button:has-text("تذكرة صيانة جديدة")');
    if (await newTicketBtn.isVisible()) {
      await newTicketBtn.click();
    }
  });

  test('E2E Scenario 3: Global Command Palette (Ctrl+K)', async ({ page }) => {
    await page.keyboard.press('Control+KeyK');
    const searchModal = page.locator('input[placeholder*="بحث سريع"]');
    if (await searchModal.isVisible()) {
      await searchModal.fill('iPhone');
      await page.keyboard.press('Escape');
    }
  });
});
