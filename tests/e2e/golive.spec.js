/**
 * tests/e2e/golive.spec.js — Phase 4: go-live E2E across all 8 locales.
 * Run:  BASE_URL=https://www.colleagueai.ai npx playwright test tests/e2e/golive.spec.js
 * (Defaults to the local replica: npm run build && node tests/local-server.mjs 4173 &)
 * Report-only: never completes a payment; only asserts the Stripe checkout PAGE loads.
 */
import { test, expect } from '@playwright/test';

const BASE = (process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '');
const LOCALES = [
  { code: 'en', path: '/agents' },
  { code: 'cs', path: '/cs/agenti' },
  { code: 'es', path: '/es/agentes' },
  { code: 'pt', path: '/pt/agentes' },
  { code: 'fr', path: '/fr/agents' },
  { code: 'de', path: '/de/agenten' },
  { code: 'pl', path: '/pl/agenci' },
  { code: 'it', path: '/it/agenti' },
];
const PRICE_PLACEHOLDERS = /(TBD|XXX|0\s*Kč|€\s*0\b|\{\{.*\}\}|YOUR_SCHEDULER_URL|Pricing on request)/i;

for (const { code, path } of LOCALES) {
  test.describe(`locale ${code}`, () => {
    test(`1. ${path} loads with zero console errors / failed requests`, async ({ page }) => {
      const errors = [], failed = [];
      page.on('console', m => m.type() === 'error' && errors.push(m.text()));
      page.on('requestfailed', r => !/analytics|plausible|sentry|vitals/.test(r.url()) && failed.push(r.url()));
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      expect.soft(errors, 'console errors (catches ORDER/NAMES ReferenceError + AGENTS_CS SyntaxError)').toEqual([]);
      expect(failed).toEqual([]);
    });

    test(`2. primary nav links resolve (no 404)`, async ({ page, request }) => {
      await page.goto(BASE + path);
      const hrefs = await page.$$eval('nav a[href], header a[href]', as => as.map(a => a.href));
      for (const h of [...new Set(hrefs)].filter(h => h.startsWith('http') && !h.includes('#'))) {
        const r = await request.get(h);
        expect.soft(r.status(), h).toBeLessThan(400);
      }
    });

    test(`3. purchase modal shows a real price (no placeholder)`, async ({ page }) => {
      await page.goto(BASE + path);
      await page.locator('.card, [data-slug]').first().click();
      await page.getByText(/Get this agent|Získat|Obtener|Obter|Obtenir|holen|Pobierz|Ottieni/i).first().click();
      const priceText = (await page.locator('#paymodal').innerText()).trim();
      expect(priceText, 'price area must show an amount').not.toMatch(PRICE_PLACEHOLDERS);
      expect(priceText).toMatch(/[€$£]\s?\d|\d+\s?(Kč|EUR|USD)/);
    });

    test(`4. demo / book-a-call CTA resolves (not "#", not placeholder scheduler)`, async ({ page, request }) => {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      for (const id of ['nav-call-link', 'hero-call-link']) {
        const href = await page.locator('#' + id).getAttribute('href');
        expect.soft(href, id).not.toBe('#');
        expect.soft(href, id).not.toMatch(/YOUR_SCHEDULER_URL/);
        const r = await request.get(href.startsWith('http') ? href : BASE + href);
        expect.soft(r.status(), `${id} → ${href}`).toBeLessThan(400);
      }
    });

    test(`8. 404 page renders properly in-locale`, async ({ page }) => {
      const resp = await page.goto(BASE + '/' + code + '/definitely-not-a-page-xyz');
      // SPA catch-all currently returns 200 + marketplace; a proper 404 page is the target state
      expect.soft(resp.status(), 'should be a real 404').toBe(404);
      await expect(page.locator('body')).not.toHaveText(/^\s*$/);
    });
  });
}

test('5. store purchase opens a live Stripe Checkout page (no payment completed)', async ({ page, context }) => {
  await page.goto(BASE + '/agents');
  await page.locator('.card, [data-slug]').first().click();
  await page.getByText(/Get this agent/i).first().click();
  await page.locator('#pay-terms-cb').check();
  const [checkout] = await Promise.all([
    context.waitForEvent('page', { timeout: 15000 }),
    page.locator('#pay-cta').click(),
  ]);
  await checkout.waitForLoadState('domcontentloaded');
  expect(checkout.url(), 'must land on Stripe').toMatch(/(checkout\.stripe\.com|buy\.stripe\.com)/);
  await expect(checkout.locator('body')).toContainText(/[€$£]\s?\d/);
  await checkout.close(); // never proceed to payment
});

for (const code of ['en', 'de']) {
  test(`6. attribution journey survives to checkout handoff (${code})`, async ({ page }) => {
    const path = LOCALES.find(l => l.code === code).path;
    await page.goto(BASE + path + '?partner=TESTPARTNER', { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => localStorage.getItem('cai_partner'))).toBe('TESTPARTNER');
    await page.goto(BASE + '/agents'); // navigate on, value must survive
    expect(await page.evaluate(() => localStorage.getItem('cai_partner'))).toBe('TESTPARTNER');
    await page.locator('.card, [data-slug]').first().click();
    await page.getByText(/Get this agent|holen/i).first().click();
    await page.locator('#pay-terms-cb').check();
    const href = await page.locator('#pay-cta').getAttribute('href');
    expect(href, 'checkout handoff must carry partner + client_reference_id')
      .toMatch(/partner=TESTPARTNER/);
    expect(href).toMatch(/client_reference_id=/);
  });
}

test('7. language switcher preserves current path/agent', async ({ page }) => {
  await page.goto(BASE + '/agents', { waitUntil: 'networkidle' });
  await page.locator('.card, [data-slug]').first().click(); // open an agent
  await page.locator('#langsel').selectOption('de');
  // agent modal must still be open and translated; URL/path must not reset to home
  await expect(page.locator('#langsel')).toHaveValue('de');
  expect(new URL(page.url()).pathname).not.toBe('/');
  await expect(page.locator('[data-i18n="nav_philosophy"]').first()).not.toHaveText('Philosophy');
});
