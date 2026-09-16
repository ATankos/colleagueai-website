import { test, expect } from '@playwright/test';

/*
 * The visible unified header (.cai-uni-header, built by
 * public/colleagueai-mobile-fix.js) owns the language selector users actually
 * see; the original per-page headers are hidden behind it. Switching language
 * must keep the reader on the equivalent page — legal pages and Insights
 * articles map through the page's own hreflang alternates, the main sections
 * through MENU, and the English-only agent factsheets land on the target
 * locale's catalogue, never on a bare locale homepage.
 */

const BASE = (
  process.env.BASE_URL ??
  'http://127.0.0.1:4173'
).replace(/\/$/, '');

const CASES = [
  /* legal pages: hreflang alternates carry the localized slugs */
  { from: '/cs/vraceni-penez', pick: '/de', to: '/de/rueckerstattung' },
  { from: '/de/barrierefreiheit', pick: '/fr', to: '/fr/accessibilite' },
  { from: '/fr/ia-responsable', pick: '/es', to: '/es/ia-responsable' },
  { from: '/es/contacto', pick: '/pt', to: '/pt/contacto' },
  /* insights articles: per-article localized slugs */
  {
    from: '/cs/insights/ramec-governance-ai-agentu',
    pick: '/de',
    to: '/de/insights/governance-framework-fuer-ki-agenten'
  },
  /* English-only factsheet: the catalogue, never the bare homepage */
  { from: '/agents/reconciliation-root-cause-agent', pick: '/cs', to: '/cs/agenti' },
  /* the MENU mapping for main sections keeps working exactly as before */
  { from: '/cs/cenik', pick: '/de', to: '/de/preise' },
  { from: '/de/agenten', pick: '/en', value: '/', to: '/agents' }
];

for (const c of CASES) {
  test(`language switch keeps the page: ${c.from} → ${c.to}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(BASE + c.from, { waitUntil: 'networkidle' });

    const selector = page.locator('.cai-uni-links .cai-uni-lang');
    await expect(selector).toBeVisible();

    await selector.selectOption(c.value ?? c.pick);

    await page.waitForURL((url) => url.pathname === c.to);
    expect(new URL(page.url()).pathname).toBe(c.to);
  });
}

/*
 * The mobile drawer clones the same selector (.cai-uni-mlang); it must follow
 * the same routes.
 */
test('mobile language switch keeps the page: /de/barrierefreiheit → /fr/accessibilite', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(BASE + '/de/barrierefreiheit', { waitUntil: 'networkidle' });

  const burger = page.locator('.cai-uni-burger');
  await expect(burger).toBeVisible();
  await burger.click();

  const selector = page.locator('.cai-uni-mnav .cai-uni-lang');
  await expect(selector).toBeVisible();

  await selector.selectOption('/fr');

  await page.waitForURL((url) => url.pathname === '/fr/accessibilite');
  expect(new URL(page.url()).pathname).toBe('/fr/accessibilite');
});
