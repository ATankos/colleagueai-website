import { test, expect } from '@playwright/test'

const MOJIBAKE_PATTERNS = ['Ã¡', 'Ã©', 'Ã­', 'Ä›', 'Å™', 'Å¡', 'Å¾', 'Å¯']

async function switchToCzech(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 })

  const candidates = [
    page.getByRole('button', { name: /^CS$/i }),
    page.getByRole('button', { name: /Čeština|Česky|Czech|CS/i }),
    page.getByText(/^CS$/i),
    page.getByText(/Čeština|Česky|Czech/i),
  ]

  let switched = false

  for (const candidate of candidates) {
    try {
      const count = await candidate.count()
      if (count > 0) {
        await candidate.first().click({ timeout: 5000 })
        switched = true
        break
      }
    } catch {
      // Try next selector candidate.
    }
  }

  if (!switched) {
    await page.screenshot({ path: 'test-results/czech-switch-missing.png', fullPage: true })
    throw new Error('Could not find a Czech locale switcher. Expected button/text like CS, Česky, Čeština, or Czech.')
  }

  // Do not let remote/local font loading block the entire test for 30 seconds.
  await Promise.race([
    page.evaluate(() => document.fonts && document.fonts.ready),
    page.waitForTimeout(5000),
  ])

  await page.waitForTimeout(300)
}

test.describe('Czech diacritics', () => {
  test.beforeEach(async ({ page }) => {
    await switchToCzech(page)
  })

  test('every Czech diacritic character renders somewhere on the page', async ({ page }) => {
    const bodyText = await page.evaluate(() => document.body.innerText)

    const requiredLowercase = ['á', 'č', 'é', 'í', 'ě', 'ř', 'š', 'ú', 'ů', 'ý', 'ž']
    const missing = requiredLowercase.filter((ch) => !bodyText.includes(ch))

    expect(
      missing,
      `Diacritics missing from rendered DOM: ${missing.join(', ')}`
    ).toEqual([])
  })

  test('no UTF-8 mojibake on the page', async ({ page }) => {
    const bodyText = await page.evaluate(() => document.body.innerText)
    const found = MOJIBAKE_PATTERNS.filter((pattern) => bodyText.includes(pattern))

    expect(
      found,
      `Mojibake sequences found: ${found.join(', ')}`
    ).toEqual([])
  })

  test('Fraunces serif heading font is applied for Czech headings', async ({ page }) => {
    const h1 = page.getByRole('heading', { level: 1 }).first()
    await expect(h1).toBeVisible({ timeout: 10000 })

    const fontFamily = await h1.evaluate((el) =>
      window.getComputedStyle(el).fontFamily
    )

    expect(
      fontFamily.toLowerCase(),
      `Expected Fraunces to be applied to h1, got: ${fontFamily}`
    ).toContain('fraunces')
  })

  test('Geist body font is applied for Czech body text', async ({ page }) => {
    const body = page.locator('body')
    await expect(body).toBeVisible({ timeout: 10000 })

    const fontFamily = await body.evaluate((el) =>
      window.getComputedStyle(el).fontFamily
    )

    expect(
      fontFamily.toLowerCase(),
      `Expected Geist to be applied to body text, got: ${fontFamily}`
    ).toContain('geist')
  })

  test('individual diacritic-bearing Czech words render correctly', async ({ page }) => {
    const bodyText = await page.evaluate(() => document.body.innerText)

    const expectedWords = [
      'skutečně',
      'Filozofie',
      'Kontakt',
      'Ceník',
      'Měsíční',
      'Přínosy',
    ]

    const missing = expectedWords.filter((word) => !bodyText.includes(word))
    const foundCount = expectedWords.length - missing.length

    expect(
      foundCount,
      `Expected at least 3 Czech words with diacritics to render. Found ${foundCount}. Missing: ${missing.join(', ')}`
    ).toBeGreaterThanOrEqual(3)
  })
})
