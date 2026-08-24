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

    test(`3. selected agent package access carries agent and tier`, async ({ page, request }) => {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.locator('.card').first().click();

      await expect(page.locator('#drawer')).toHaveClass(/open/);

      for (const id of ['d-cs', 'd-m365']) {
        const href = await page.locator('#' + id).getAttribute('href');

        expect(href, id)
          .toMatch(/^\/demo\?agent=[a-z0-9-]+&tier=L[234]$/);

        const url = new URL(href, BASE).toString();
        const r = await request.get(url);

        expect.soft(r.status(), `${id} -> ${href}`)
          .toBeLessThan(400);
      }
    });

    test(`4. demo / book-a-call CTA resolves (not "#", not placeholder scheduler)`, async ({ page, request }) => {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });

      const demoLinks = page.locator('a[href*="/demo"]');

      expect(
        await demoLinks.count(),
        'page must expose at least one demo CTA'
      ).toBeGreaterThan(0);

      const hrefs = await demoLinks.evaluateAll((links) =>
        [...new Set(
          links
            .map((a) => a.getAttribute('href'))
            .filter(Boolean)
        )]
      );

      for (const href of hrefs) {
        expect.soft(href, 'demo CTA').not.toBe('#');
        expect.soft(href, 'demo CTA').not.toMatch(/YOUR_SCHEDULER_URL/);

        const url = href.startsWith('http')
          ? href
          : new URL(href, BASE).toString();

        const r = await request.get(url);
        expect.soft(r.status(), `demo CTA -> ${href}`).toBeLessThan(400);
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
  test.skip(
    process.env.CHECKOUT_E2E !== '1',
    'Stripe checkout E2E is disabled until checkout is intentionally enabled'
  );
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
    test.skip(
      process.env.CHECKOUT_E2E !== '1',
      'Checkout attribution E2E is disabled until checkout is intentionally enabled'
    );
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

test('7. language switcher preserves current catalogue route and URL context', async ({ page }) => {
  await page.goto(BASE + '/agents?qa=1#catalogue', { waitUntil: 'networkidle' });

  const langsel = page.locator('#langsel');
  await expect(langsel).toBeAttached();
  await langsel.selectOption('de', { force: true });

  await page.waitForURL((url) =>
    url.pathname === '/de/agenten' &&
    url.searchParams.get('qa') === '1' &&
    url.hash === '#catalogue'
  );

  const current = new URL(page.url());

  expect(current.pathname).toBe('/de/agenten');
  expect(current.searchParams.get('qa')).toBe('1');
  expect(current.hash).toBe('#catalogue');

  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});
