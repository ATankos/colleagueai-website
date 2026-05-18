import { test, expect } from '@playwright/test'

// VISUAL REGRESSION
// Captures pixel-baseline screenshots of key sections in EN + CS.
// First run: generates baselines (commit them to git).
// Subsequent runs: compares pixel-by-pixel; fails on visual change.
//
// To intentionally update baselines after a design change:
//   npm run visual:update

// Visual regression runs only on the chromium project. Cross-browser visual
// baselines would multiply maintenance and fail on harmless font-kerning
// differences. The skip lives in beforeEach below so the spec is safe to
// include in `playwright test` (no project filter) as well as `npm run visual`.

// Helper: navigate, set language, and wait until fonts + animations have settled
async function preparePage(page, lang) {
  await page.goto('/')

  if (lang === 'cs') {
    await page.getByRole('button', { name: 'CS', exact: true }).click()
  }

  // 1. Wait for all webfonts to actually load. document.fonts.ready resolves
  //    once the browser has every @font-face the page requested.
  await page.evaluate(() => document.fonts.ready)

  // 2. Disable CSS animations and transitions so fade-up keyframes
  //    don't capture mid-animation
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
    `,
  })

  // 3. Small settle pause so reflow from font load completes
  await page.waitForTimeout(300)
}

for (const lang of ['en', 'cs']) {
  test.describe(`Visual regression — ${lang.toUpperCase()}`, () => {
    test.beforeEach(async ({ page }, testInfo) => {
      // Skip on every non-chromium project. Inside beforeEach `testInfo`
      // is defined, so this works correctly when invoked from
      // `playwright test` (no --project filter).
      test.skip(
        testInfo.project.name !== 'chromium',
        'Visual regression runs only on chromium'
      )
      await preparePage(page, lang)
    })

    test(`hero section (${lang})`, async ({ page }) => {
      // Hero is at the top — capture the first viewport
      await expect(page).toHaveScreenshot(`hero-${lang}.png`, {
        fullPage: false,
        maxDiffPixelRatio: 0.01,
      })
    })

    test(`trust section (${lang})`, async ({ page }) => {
      const trust = page.locator('#trust')
      await trust.scrollIntoViewIfNeeded()
      await page.waitForTimeout(200)
      await expect(trust).toHaveScreenshot(`trust-${lang}.png`, {
        maxDiffPixelRatio: 0.01,
      })
    })

    test(`marketplace section (${lang})`, async ({ page }) => {
      const market = page.locator('#marketplace')
      await market.scrollIntoViewIfNeeded()
      await page.waitForTimeout(200)
      await expect(market).toHaveScreenshot(`marketplace-${lang}.png`, {
        maxDiffPixelRatio: 0.01,
      })
    })

    test(`pricing section (${lang})`, async ({ page }) => {
      const pricing = page.locator('#pricing')
      await pricing.scrollIntoViewIfNeeded()
      await page.waitForTimeout(200)
      await expect(pricing).toHaveScreenshot(`pricing-${lang}.png`, {
        maxDiffPixelRatio: 0.01,
      })
    })

    test(`contact section (${lang})`, async ({ page }) => {
      const contact = page.locator('#contact')
      await contact.scrollIntoViewIfNeeded()
      await page.waitForTimeout(200)
      await expect(contact).toHaveScreenshot(`contact-${lang}.png`, {
        maxDiffPixelRatio: 0.01,
      })
    })
  })
}
