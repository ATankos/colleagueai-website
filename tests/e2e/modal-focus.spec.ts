/**
 * CAI-010 — keyboard and screen-reader behaviour of the catalogue's two dialogs:
 * the agent drawer and the access ("Get this agent") panel.
 *
 * A dialog that opens without moving focus, lets Tab wander into the page
 * behind it, or drops focus on close is unusable with a keyboard or screen
 * reader. These tests pin the contract: focus moves in on open, stays inside
 * while open, and returns to the triggering element on close — and both
 * dialogs carry a role and an accessible name.
 *
 * Run: node scripts/run-playwright-static.cjs tests/e2e/modal-focus.spec.ts --project=chromium-desktop
 */
import { test, expect, type Page } from '@playwright/test';

const openDrawer = async (page: Page) => {
  await page.goto('/agents');
  const card = page.locator('.card').first();
  await card.click();
  await expect(page.locator('#drawer')).toHaveAttribute('aria-hidden', 'false');
  return card;
};

test.describe('agent drawer dialog', () => {
  test('has dialog semantics and an accessible name', async ({ page }) => {
    await openDrawer(page);
    const drawer = page.locator('#drawer');
    await expect(drawer).toHaveAttribute('role', 'dialog');
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    await expect(drawer).toHaveAttribute('aria-labelledby', 'd-name');
    await expect(page.locator('#d-name')).not.toBeEmpty();
  });

  test('moves focus in on open, keeps Tab inside, and restores it on Escape', async ({ page }) => {
    await openDrawer(page);
    await expect(page.locator('#dclose')).toBeFocused();

    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() =>
        document.getElementById('drawer')!.contains(document.activeElement));
      expect(inside, `Tab press ${i + 1} escaped the drawer`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(page.locator('#drawer')).toHaveAttribute('aria-hidden', 'true');
    const restored = await page.evaluate(() =>
      document.activeElement !== document.body && document.activeElement !== null);
    expect(restored, 'focus should return to the trigger, not fall to <body>').toBe(true);
  });
});

test.describe('access panel dialog', () => {
  // While STORE.gate.dossier is false the dossier button links straight to the
  // PDF and the package links go to /demo, so nothing in the UI opens this
  // panel. It is still shipped and re-armed by a config flip, so the tests pin
  // its dialog contract by opening it the way the gate handler would:
  // window.openPay() with the drawer's current agent set.
  const openPay = async (page: Page) => {
    await openDrawer(page);
    await page.evaluate(() => (window as unknown as { openPay: () => void }).openPay());
    await expect(page.locator('#paymodal')).toHaveAttribute('aria-hidden', 'false');
  };

  test('has dialog semantics and an accessible name', async ({ page }) => {
    await openPay(page);
    const modal = page.locator('#paymodal');
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');
    await expect(modal).toHaveAttribute('aria-labelledby', 'pay-h');
    await expect(page.locator('#pay-h')).not.toBeEmpty();
  });

  test('moves focus in on open, keeps Tab inside, and restores it on close', async ({ page }) => {
    await openPay(page);
    await expect(page.locator('#payclose')).toBeFocused();

    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() =>
        document.getElementById('paymodal')!.contains(document.activeElement));
      expect(inside, `Tab press ${i + 1} escaped the access panel`).toBe(true);
    }

    // Close with the panel's own button (Escape is a document-level listener
    // shared with the drawer, so it would close both dialogs at once).
    await page.locator('#payclose').click();
    await expect(page.locator('#paymodal')).toHaveAttribute('aria-hidden', 'true');
    // Focus returns to what was focused when the panel opened: the drawer's
    // close button (the drawer itself is still open underneath).
    await expect(page.locator('#dclose')).toBeFocused();
  });
});
