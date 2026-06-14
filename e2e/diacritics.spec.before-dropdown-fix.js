import { test, expect } from '@playwright/test'

const MOJIBAKE_PATTERNS = ['Ã¡', 'Ã©', 'Ã­', 'Ä›', 'Å™', 'Å¡', 'Å¾', 'Å¯']

async function switchToCzech(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 })

  // The language options are inside a dropdown.
  // The visible button is usually "EN ▾", then the menu contains "CS Čeština".
  const langDropdown = page.locator('button[aria-haspopup="listbox"]').first()
  await expect(langDropdown).toBeVisible({ timeout: 10000 })
  await langDropdown.click()

  const czechOption = page.getByRole('button', { name: /CS\s+Čeština|CS|Čeština/i }).first()
  await expect(czechOption).toBeVisible({ timeout: 10000 })
  await czechOption.click()

  // Confirm Czech rendered content appears.
  await expect(page.getByText(/skutečně|Certifikovaní|Připraveni|Filozofie|Ceník/i).first()).toBeVisible({
    timeout: 10000,
  })

  // Do not let font loading hang the full test.
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
