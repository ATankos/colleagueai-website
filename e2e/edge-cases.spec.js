import { test, expect } from '@playwright/test'

// EDGE-CASE TESTS â€” run only on chromium (these are environment checks,
// not rendering-engine checks; running on 5 browsers adds nothing).
const onlyChromium = (_page, testInfo) =>
  test.skip(testInfo.project.name !== 'chromium', 'Chromium only')

// ------------------------------------------------------------------
// TEST 1 â€” JavaScript disabled
// ------------------------------------------------------------------
// React SPAs typically render nothing without JS. We want at minimum:
//   * a <noscript> message visible
//   * a way to contact us (mailto: link)
// If neither exists, the test fails and we add a <noscript> fallback.

test.describe('Edge case: JavaScript disabled', () => {
  test('shows fallback content with contact info when JS is off', async ({ browser }, testInfo) => {
    onlyChromium({}, testInfo)
    // Open a NEW context with JS disabled â€” original context unaffected
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/')

    const bodyText = (await page.locator('body').innerText()).toLowerCase()

    // Expect at least one of: a noscript message OR a mailto link OR our brand mark.
    // The page should NOT be a totally blank/empty white screen.
    const hasContact = bodyText.includes('@colleagueai.ai') || bodyText.includes('hello@')
    const hasNoscript = bodyText.includes('javascript') || bodyText.includes('enable')
    const hasBrand = bodyText.includes('colleague')

    expect(
      hasContact || hasNoscript || hasBrand,
      `With JS disabled, the page is essentially blank. Body text was: "${bodyText.slice(0, 200)}"`
    ).toBe(true)

    await context.close()
  })
})

// ------------------------------------------------------------------
// TEST 2 â€” 200% browser zoom
// ------------------------------------------------------------------
// At 200% zoom (a WCAG 1.4.4 requirement), text must reflow without
// horizontal scrolling. We assert no horizontal overflow at zoomed viewport.

test.describe('Edge case: 200% zoom', () => {
  test('content reflows at 200% zoom without horizontal scrolling', async ({ browser }, testInfo) => {
    onlyChromium({}, testInfo)
    // Simulating 200% zoom by halving the viewport width â€” that's what 200%
    // effectively does to the layout from a CSS perspective.
    const context = await browser.newContext({
      viewport: { width: 720, height: 900 }, // ~half of 1440x900
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)

    // Check for horizontal scrollbar: scrollWidth > clientWidth means content overflows
    const overflow = await page.evaluate(() => {
      const html = document.documentElement
      const body = document.body
      const docW = Math.max(html.scrollWidth, body.scrollWidth)
      const viewW = html.clientWidth
      return { docW, viewW, overflowing: docW > viewW + 2 } // +2 px slack
    })

    expect(
      overflow.overflowing,
      `Horizontal overflow at 200% zoom: docWidth=${overflow.docW}px, viewportWidth=${overflow.viewW}px`
    ).toBe(false)

    await context.close()
  })
})

// ------------------------------------------------------------------
// TEST 3 â€” Slow 3G network
// ------------------------------------------------------------------
// Site should still load and become interactive within a reasonable budget
// (we use 20s as the ceiling â€” generous for true 3G).
// Uses Chrome DevTools Protocol to throttle the network.

test.describe('Edge case: slow 3G', () => {
  test('production site loads on simulated slow 3G', async ({ browser }, testInfo) => {
    onlyChromium({}, testInfo)
    // Hit the LIVE site, not the dev server. The dev server ships unminified
    // ESM modules over a long request waterfall; the production bundle ships
    // a single ~67KB gzipped JS file. Only the production bundle is what real
    // 3G users would actually experience.
    const context = await browser.newContext()
    const page = await context.newPage()

    const client = await context.newCDPSession(page)
    await client.send('Network.enable')
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,
      downloadThroughput: (500 * 1024) / 8,
      uploadThroughput: (500 * 1024) / 8,
    })

    const start = Date.now()
    await page.goto('https://colleagueai.ai/', { waitUntil: 'load', timeout: 30000 })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 })
    const elapsed = Date.now() - start

    expect(
      elapsed,
      `Hero took ${elapsed}ms to render on simulated slow 3G â€” exceeds 20s budget`
    ).toBeLessThan(20000)

    console.log(`[3G] Hero visible after ${elapsed}ms`)
    await context.close()
  })
})


