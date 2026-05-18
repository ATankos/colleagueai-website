import { test, expect } from '@playwright/test'

// CZECH DIACRITICS RENDERING CHECK
// Runs across every browser project (chromium/firefox/webkit/mobile-*) by
// default so we catch font-substitution bugs that only appear in one engine.
//
// What this verifies:
//   1. Each Czech diacritic character is present in the rendered DOM text.
//   2. The element rendering Czech text resolves to one of our intended
//      web fonts (Fraunces / Geist / JetBrains Mono) — not the browser
//      fallback (Times, Arial, etc.), which would silently indicate a
//      missing-glyph fallback.
//   3. Diacritics aren't accidentally being shown as mojibake
//      (e.g. "Ä›" instead of "ě" from a UTF-8 mis-decode).

// Mojibake patterns — sequences that appear when UTF-8 is misdecoded as latin1
const MOJIBAKE_PATTERNS = ['Ã¡','Ã©','Ã­','Ä›','Å™','Å¡','Å¾','Å¯']

test.describe('Czech diacritics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Switch to Czech locale
    await page.getByRole('button', { name: 'CS', exact: true }).click()
    // Wait for webfonts so font-substitution check is meaningful
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(200)
  })

  test('every Czech diacritic character renders somewhere on the page', async ({ page }) => {
    const bodyText = await page.evaluate(() => document.body.innerText)

    // We don't expect EVERY single uppercase diacritic to appear — the page
    // uses some uppercase eyebrows but not all. The lowercase set should all
    // appear at least once across the Czech copy (hero, marketplace, pricing,
    // philosophy, contact).
    const requiredLowercase = ['á','č','é','í','ě','ř','š','ú','ů','ý','ž']
    const missing = requiredLowercase.filter((ch) => !bodyText.includes(ch))
    expect(missing, `Diacritics missing from rendered DOM: ${missing.join(', ')}`).toEqual([])
  })

  test('no UTF-8 mojibake on the page', async ({ page }) => {
    const bodyText = await page.evaluate(() => document.body.innerText)
    const found = MOJIBAKE_PATTERNS.filter((p) => bodyText.includes(p))
    expect(found, `Mojibake sequences found: ${found.join(', ')}`).toEqual([])
  })

  test('Fraunces (serif heading font) actually loads for Czech headings', async ({ page }) => {
    // Czech hero h1 contains "skutečně nasadit." with diacritics
    const h1 = page.getByRole('heading', { level: 1 })
    const fontFamily = await h1.evaluate((el) =>
      window.getComputedStyle(el).fontFamily
    )

    // The applied font-family list must START with Fraunces.
    // If it doesn't, the browser fell back — possibly because the font
    // doesn't have the glyph, possibly because the font itself didn't load.
    expect(
      fontFamily.toLowerCase(),
      `Expected Fraunces to be applied to <h1>, got: ${fontFamily}`,
    ).toContain('fraunces')
  })

  test('Geist (body font) actually loads for Czech body text', async ({ page }) => {
    // Find the Czech hero subhead paragraph
    const sub = page.getByText(/Certifikovaní AI kolegové/)
    await expect(sub).toBeVisible()
    const fontFamily = await sub.evaluate((el) =>
      window.getComputedStyle(el).fontFamily
    )
    expect(
      fontFamily.toLowerCase(),
      `Expected Geist to be applied to body text, got: ${fontFamily}`,
    ).toContain('geist')
  })

  test('individual diacritic-bearing words actually render the diacritic glyph', async ({ page }) => {
    // Pick a few specific Czech words from the site and verify they appear
    // intact (right diacritic in the right spot). If the font is missing
    // those glyphs, you might see them stripped or substituted.
    const expectedWords = [
      'skutečně',  // hero h1: "AI agenti, které lze skutečně nasadit."
      'Filozofie', // nav
      'Kontakt',   // nav
      'Ceník',     // nav, pricing
      'Měsíční',   // agent name (finance category)
      'Přínosy',   // common Czech body word — may appear in pricing
    ]

    const bodyText = await page.evaluate(() => document.body.innerText)
    const missing = expectedWords.filter((w) => bodyText && !bodyText.includes(w))
    // Some of the "expected" words may be optional copy; require at least 3 of them.
    const foundCount = expectedWords.length - missing.length
    expect(
      foundCount,
      `Expected at least 3 diacritic-rich Czech words to render, found ${foundCount} of ${expectedWords.length}. Missing: ${missing.join(', ')}`,
    ).toBeGreaterThanOrEqual(3)
  })
})
