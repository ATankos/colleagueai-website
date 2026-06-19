/**
 * e2e/languages-nav.spec.js — deep check: language switching + navigation depth.
 *
 * Three groups:
 *   1. Language switcher MECHANICS        — should pass today (the switcher works).
 *   2. Translation COVERAGE               — FAILS today on the 7 sections that have no
 *                                           data-i18n hooks; each failure names the section
 *                                           still showing English. These go green once the
 *                                           translations are merged into the I18N dictionary.
 *   3. Navigation DEPTH                   — skip link, cross-page links, localized nav, drawer.
 *
 * Run:  npx playwright test languages-nav.spec.js --project=chromium --project=mobile-chrome
 * (Not wired into CI yet — group 2 is an intentional, documenting failure until i18n is filled.)
 */
import { test, expect } from '@playwright/test';

const isMobile = (t) => t.project.name.startsWith('mobile-');
const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];

// Sections with NO data-i18n today → still English after a language switch (the "mishmash").
const UNTRANSLATED = [
  ['#tenant-architecture', 'Designed to run in your tenant'],
  ['#proof-demo', 'turns a reconciliation issue into auditable evidence'],
  ['#cai-next-steps', 'A simple path from interest to controlled evaluation'],
  ['#launch-readiness-gate', 'Paid checkout remains gated'],
  ['#cai-who-for', 'Built for buyers who need governed outcomes'],
  ['#cai-buyer-path', 'Governed AI agent packages for enterprise teams'],
  ['#cai-score-guide', 'Understand implementation complexity before the demo'],
];

test.describe('1 · Language switcher mechanics', () => {
  test('offers all 8 languages (en + 7 locales)', async ({ page }) => {
    await page.goto('/agents.html');
    await expect(page.locator('#langsel option')).toHaveCount(8);
    for (const l of ['en', ...LOCALES]) {
      await expect(page.locator(`#langsel option[value="${l}"]`), `option ${l}`).toHaveCount(1);
    }
  });

  test('switching sets <html lang> and translates the nav', async ({ page }) => {
    await page.goto('/agents.html');
    const philosophy = page.locator('.nav-links a[href="#philosophy"]');
    const english = (await philosophy.textContent())?.trim();
    await page.selectOption('#langsel', 'de');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(philosophy, 'nav label should change language').not.toHaveText(english);
  });

  test('language choice persists across reload', async ({ page }) => {
    await page.goto('/agents.html');
    await page.selectOption('#langsel', 'fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await page.reload();
    await expect(page.locator('html'), 'language should survive a reload').toHaveAttribute('lang', 'fr');
  });

  test('switching back to English restores the nav', async ({ page }) => {
    await page.goto('/agents.html');
    await page.selectOption('#langsel', 'de');
    await page.selectOption('#langsel', 'en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.nav-links a[href="#catalogue"]')).toHaveText('Catalogue');
  });
});

test.describe('2 · Translation coverage (fails until the i18n gap is filled)', () => {
  for (const [sel, englishSnippet] of UNTRANSLATED) {
    test(`${sel} translates (not English) after switching to German`, async ({ page }) => {
      await page.goto('/agents.html');
      await page.selectOption('#langsel', 'de');
      await expect(page.locator(sel)).toBeVisible();
      await expect(
        page.locator(sel),
        `${sel} still shows English ("${englishSnippet}…") after switching to German — section is not wired for i18n`
      ).not.toContainText(englishSnippet, { timeout: 3000 });
    });
  }
});

test.describe('3 · Navigation depth', () => {
  test('skip link targets a real element', async ({ page }) => {
    await page.goto('/agents.html');
    const href = await page.locator('a.skip-link').first().getAttribute('href');
    expect(href, 'skip link has href').toBeTruthy();
    await expect(page.locator(href)).toHaveCount(1);
  });

  test('cross-page links are present and correctly targeted', async ({ page }) => {
    await page.goto('/agents.html');
    for (const dest of ['/demo', '/partners', '/trust', '/license', '/terms']) {
      await expect(
        page.locator(`a[href="${dest}"], a[href="https://www.colleagueai.ai${dest}"]`).first(),
        `link to ${dest}`
      ).toHaveCount(1);
    }
  });

  test('every localized page carries the same nav + switcher + drawer', async ({ page }) => {
    for (const loc of LOCALES) {
      await page.goto(`/${loc}/agents.html`);
      await expect(page.locator('header.nav .nav-links a[href="#catalogue"]'), `${loc}: catalogue link`).toHaveCount(1);
      await expect(page.locator('#langsel option'), `${loc}: language options`).toHaveCount(8);
      await expect(page.locator('#cainavDrawer'), `${loc}: mobile drawer`).toHaveCount(1);
      await expect(page.locator('html'), `${loc}: html lang`).toHaveAttribute('lang', loc);
    }
  });

  test('language can be switched on a localized page', async ({ page }) => {
    await page.goto('/de/agents.html');
    await page.selectOption('#langsel', 'fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('mobile drawer reaches all 8 sections + 2 CTAs', async ({ page }, t) => {
    test.skip(!isMobile(t), 'mobile device projects only');
    await page.goto('/agents.html');
    await page.locator('#cainavBurger').click();
    await expect(page.locator('#cainavDrawer')).toBeVisible();
    await expect(page.locator('#cainavDrawer a')).toHaveCount(10);
  });
});
