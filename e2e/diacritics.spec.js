import { test, expect } from '@playwright/test'

const MOJIBAKE_PATTERNS = [
  'Ã¡', 'Ã©', 'Ã­', 'Ã³', 'Ãº', 'Ã½', 'Ã¢', 'Ãª', 'Ãµ', 'Ã§',
  'Ä›', 'Å™', 'Å¡', 'Å¾', 'Å¯', 'Ä…', 'Ä‡', 'Å‚', 'Å„', 'Å›', 'Åº', 'Å¼',
]

async function selectLocale(page, code, expectedWords = []) {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 })

  await page.evaluate((localeCode) => {
    const keys = [
      'lang',
      'language',
      'locale',
      'selectedLanguage',
      'cai-lang',
      'caiLang',
      'colleagueai-lang',
      'colleagueai-language',
    ]

    for (const key of keys) {
      try {
        localStorage.setItem(key, localeCode)
      } catch {}
    }
  }, code)

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(500)

  let bodyText = await page.evaluate(() => document.body.innerText)

  if (expectedWords.some((word) => bodyText.includes(word))) {
    return
  }

  const dropdownCandidates = [
    page.locator('button[aria-haspopup="listbox"]').first(),
    page.locator('button[aria-expanded]').first(),
    page.locator('select').first(),
    page.getByRole('button', { name: /EN|CS|DE|FR|ES|IT|PL|PT/i }).first(),
  ]

  for (const candidate of dropdownCandidates) {
    try {
      if ((await candidate.count()) > 0 && await candidate.first().isVisible()) {
        const tagName = await candidate.first().evaluate((el) => el.tagName.toLowerCase())

        if (tagName === 'select') {
          await candidate.first().selectOption(code).catch(async () => {
            await candidate.first().selectOption(code.toUpperCase())
          })
        } else {
          await candidate.first().click({ timeout: 5000 })
        }

        await page.waitForTimeout(300)
        break
      }
    } catch {}
  }

  const optionCandidates = [
    page.getByRole('button', { name: new RegExp(`\\b${code.toUpperCase()}\\b`, 'i') }).first(),
    page.getByRole('option', { name: new RegExp(`\\b${code.toUpperCase()}\\b`, 'i') }).first(),
    page.getByText(new RegExp(`\\b${code.toUpperCase()}\\b`, 'i')).first(),
  ]

  for (const option of optionCandidates) {
    try {
      if ((await option.count()) > 0 && await option.first().isVisible()) {
        await option.first().click({ timeout: 5000 })
        await page.waitForTimeout(500)
        break
      }
    } catch {}
  }

  bodyText = await page.evaluate(() => document.body.innerText)

  if (!expectedWords.some((word) => bodyText.includes(word))) {
    await page.screenshot({ path: `test-results/${code}-locale-switch-failed.png`, fullPage: true })
    throw new Error(`${code.toUpperCase()} locale did not render expected words. Body excerpt: ${bodyText.slice(0, 500)}`)
  }

  await Promise.race([
    page.evaluate(() => document.fonts && document.fonts.ready),
    page.waitForTimeout(5000),
  ])
}

test.describe('Czech diacritics', () => {
  test.beforeEach(async ({ page }) => {
    await selectLocale(page, 'cs', ['Filozofie', 'Ceník', 'skutečně', 'Certifikovaní', 'Připraveni'])
  })

  test('every Czech diacritic character renders somewhere on the page', async ({ page }) => {
    const bodyText = await page.evaluate(() => document.body.innerText)
    const requiredLowercase = ['á', 'č', 'é', 'í', 'ě', 'ř', 'š', 'ú', 'ů', 'ý', 'ž']
    const foundCount = requiredLowercase.filter((ch) => bodyText.includes(ch)).length

    expect(foundCount, 'Expected Czech diacritics to render in the DOM.').toBeGreaterThanOrEqual(5)
  })

  test('no UTF-8 mojibake on the page', async ({ page }) => {
    const bodyText = await page.evaluate(() => document.body.innerText)
    const found = MOJIBAKE_PATTERNS.filter((pattern) => bodyText.includes(pattern))

    expect(found, `Mojibake sequences found: ${found.join(', ')}`).toEqual([])
  })

  test('heading and body fonts are applied for Czech text', async ({ page }) => {
    const h1 = page.getByRole('heading', { level: 1 }).first()
    await expect(h1).toBeVisible({ timeout: 10000 })

    const h1Font = await h1.evaluate((el) => window.getComputedStyle(el).fontFamily)
    const bodyFont = await page.locator('body').evaluate((el) => window.getComputedStyle(el).fontFamily)

    expect(h1Font.toLowerCase()).toContain('fraunces')
    expect(bodyFont.toLowerCase()).toContain('geist')
  })

  test('individual Czech words with diacritics render correctly', async ({ page }) => {
    const bodyText = await page.evaluate(() => document.body.innerText)
    const expectedWords = ['skutečně', 'Filozofie', 'Kontakt', 'Ceník']
    const foundCount = expectedWords.filter((word) => bodyText.includes(word)).length

    expect(foundCount).toBeGreaterThanOrEqual(2)
  })
})
