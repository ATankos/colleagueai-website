/**
 * e2e/golive.spec.js — go-live coverage for the REAL production pages.
 *
 * In production, "/" redirects to "/agents", which serves the static public/agents.html
 * (not the React app). The Vite dev server doesn't apply vercel.json rewrites, so the
 * static pages are reached at their .html paths here (/agents.html, /de/agents.html, ...).
 *
 * Run:  npx playwright test golive.spec.js
 *       npx playwright test golive.spec.js --project=chromium   (desktop only, faster)
 */
import { test, expect } from '@playwright/test';

const isMobile = (t) => t.project.name.startsWith('mobile-');

const LOCALES = ['cs', 'de', 'fr', 'es', 'it', 'pl', 'pt'];
const STATIC_PAGES = [
  '/agents.html',
  '/partners.html',
  '/trust.html',
  '/terms.html',
  '/license.html',
  '/privacy.html',
];
const NAV_ANCHORS = ['#philosophy', '#score', '#catalogue', '#fit', '#roi', '#deploy', '#readiness', '#faq'];

// Attach error capture BEFORE navigating; returns the array of uncaught JS errors.
function captureErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

// True if any rendered (visible) text looks like leaked source code.
async function hasVisibleCode(page) {
  return page.evaluate(() => {
    const t = document.body.innerText || '';
    return t.includes('provider-agnostic') || t.includes('(function(){') || t.includes('addEventListener(');
  });
}

test.describe('Static /agents page', () => {
  test('loads, has an H1, throws no uncaught errors', async ({ page }) => {
    const errors = captureErrors(page);
    const resp = await page.goto('/agents.html');
    expect(resp?.status(), 'HTTP status').toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    expect(errors, 'uncaught JS errors:\n' + errors.join('\n')).toHaveLength(0);
  });

  test('does NOT leak raw code onto the page (analytics regression)', async ({ page }) => {
    await page.goto('/agents.html');
    expect(await hasVisibleCode(page), 'raw script/code is rendering as visible text').toBe(false);
  });

  test('the launch-readiness gate section is present and well-formed', async ({ page }) => {
    await page.goto('/agents.html');
    await expect(page.locator('#launch-readiness-gate')).toHaveCount(1);
  });

  test('desktop nav: every link scrolls to its section', async ({ page }, t) => {
    test.skip(isMobile(t), 'desktop nav links are hidden at mobile widths — see drawer tests');
    await page.goto('/agents.html');
    for (const anchor of NAV_ANCHORS) {
      const target = page.locator(anchor);
      await expect(target, `${anchor} section exists`).toHaveCount(1);
      await page.locator(`.nav-links a[href="${anchor}"]`).first().click();
      await expect(target, `${anchor} scrolled into view`).toBeInViewport({ timeout: 4000 });
    }
  });

  test('every nav anchor resolves to a real section id', async ({ page }) => {
    await page.goto('/agents.html');
    for (const anchor of NAV_ANCHORS) {
      await expect(page.locator(anchor), `${anchor} must exist`).toHaveCount(1);
    }
  });
});

test.describe('Mobile navigation drawer', () => {
  test('hamburger opens the drawer; tapping a link navigates and closes it', async ({ page }, t) => {
    test.skip(!isMobile(t), 'mobile device projects only');
    await page.goto('/agents.html');

    const burger = page.locator('#cainavBurger');
    const drawer = page.locator('#cainavDrawer');

    await expect(burger, 'hamburger visible on mobile').toBeVisible();
    await expect(drawer).toBeHidden();

    await burger.click();
    await expect(drawer, 'drawer opens').toBeVisible();
    // drawer holds the 8 section links + the 2 CTAs
    await expect(drawer.locator('a')).toHaveCount(NAV_ANCHORS.length + 2);

    await drawer.locator('a[href="#catalogue"]').click();
    await expect(drawer, 'drawer closes after a tap').toBeHidden();
    await expect(page.locator('#catalogue')).toBeInViewport({ timeout: 4000 });
  });

  test('all section links hidden on the bar are recoverable via the drawer', async ({ page }, t) => {
    test.skip(!isMobile(t), 'mobile device projects only');
    await page.goto('/agents.html');
    await page.locator('#cainavBurger').click();
    for (const anchor of NAV_ANCHORS) {
      await expect(page.locator(`#cainavDrawer a[href="${anchor}"]`)).toHaveCount(1);
    }
  });
});

test.describe('Scroll-spy active state', () => {
  test('scrolling a section marks its nav link active', async ({ page }, t) => {
    test.skip(isMobile(t), 'scroll-spy underline is a desktop-nav affordance');
    await page.goto('/agents.html');
    await page.locator('#roi').scrollIntoViewIfNeeded();
    await expect(page.locator('.nav-links a[href="#roi"]')).toHaveClass(/active/, { timeout: 4000 });
  });
});

test.describe('/demo interactive SPA', () => {
  test('the demo actually mounts (not a dead loading shell)', async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto('/demo');
    // Demo.jsx renders an H1 ending in "buy it." once React mounts.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/buy it/i, { timeout: 8000 });
    expect(errors, 'uncaught JS errors on /demo:\n' + errors.join('\n')).toHaveLength(0);
  });
});

test.describe('Localized /agents pages', () => {
  for (const loc of LOCALES) {
    test(`/${loc}/agents.html loads, sets lang="${loc}", no errors, no leaked code`, async ({ page }) => {
      const errors = captureErrors(page);
      const resp = await page.goto(`/${loc}/agents.html`);
      expect(resp?.status()).toBeLessThan(400);
      await expect(page.locator('html')).toHaveAttribute('lang', loc);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      expect(await hasVisibleCode(page), `raw code leaked on /${loc}/agents.html`).toBe(false);
      expect(errors, `errors on /${loc}/agents.html:\n` + errors.join('\n')).toHaveLength(0);
    });
  }
});

test.describe('Other static pages', () => {
  for (const path of STATIC_PAGES) {
    test(`${path} loads cleanly with no leaked code`, async ({ page }) => {
      const errors = captureErrors(page);
      const resp = await page.goto(path);
      expect(resp?.status(), `${path} status`).toBeLessThan(400);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      expect(await hasVisibleCode(page), `raw code leaked on ${path}`).toBe(false);
      expect(errors, `errors on ${path}:\n` + errors.join('\n')).toHaveLength(0);
    });
  }
});

test.describe('Primary calls-to-action', () => {
  test('"Book a call" / "Try it live" point at /demo', async ({ page }) => {
    await page.goto('/agents.html');
    const demoLinks = page.locator('a[href$="/demo"], a[href="/demo"]');
    expect(await demoLinks.count(), 'at least one /demo CTA present').toBeGreaterThan(0);
  });
});
