import { test, expect } from '@playwright/test'

const MOJIBAKE_PATTERNS = [
  'Ã¡', 'Ã©', 'Ã­', 'Ã³', 'Ãº', 'Ã½', 'Ã¢', 'Ãª', 'Ãµ', 'Ã§',
  'Ä›', 'Å™', 'Å¡', 'Å¾', 'Å¯', 'Ä…', 'Ä‡', 'Å‚', 'Å„', 'Å›', 'Åº', 'Å¼',
]

const LOCALES = [
  { code: 'en', expected: ['Marketplace', 'Pricing', 'AI agents'] },
  { code: 'cs', expected: ['Filozofie', 'Ceník', 'skutečně'], requiredChars: ['á', 'č', 'é', 'í', 'ě', 'ř', 'š'] },
  { code: 'de', expected: ['Philosophie', 'Preise'], requiredChars: ['ö', 'ü'] },
  { code: 'fr', expected: ['Philosophie', 'Tarifs'], requiredChars: ['é', 'è', 'à'] },
  { code: 'es', expected: ['Filosofía', 'Precios', 'Contacto'], requiredChars: ['í', 'ó', 'á'] },
  { code: 'it', expected: ['Filosofia', 'Prezzi', 'Contatti'] },
  { code: 'pl', expected: ['Filozofia', 'Cennik'], requiredChars: ['ć', 'ż', 'ź', 'ó', 'ń'] },
  { code: 'pt', expected: ['Filosofia', 'Preços', 'Contacto'], requiredChars: ['ç', 'ã', 'í', 'ó'] },
]

async function selectLocale(page, locale) {
  const { code, expected } = locale

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
      } catch (error) {
        void error
      }
    }
  }, code)

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(500)

  let bodyText = await page.evaluate(() => document.body.innerText)

  if (expected.some((word) => bodyText.includes(word))) {
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
          await candidate.first().selectOption(code).catch(async (error) => {
            void error
            await candidate.first().selectOption(code.toUpperCase())
          })
        } else {
          await candidate.first().click({ timeout: 5000 })
        }

        await page.waitForTimeout(300)
        break
      }
    } catch (error) {
      void error
    }
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
    } catch (error) {
      void error
    }
  }

  bodyText = await page.evaluate(() => document.body.innerText)

  if (!expected.some((word) => bodyText.includes(word))) {
    await page.screenshot({ path: `test-results/${code}-locale-switch-failed.png`, fullPage: true })
    throw new Error(`${code.toUpperCase()} locale did not render expected words. Body excerpt: ${bodyText.slice(0, 500)}`)
  }

  await Promise.race([
    page.evaluate(() => document.fonts && document.fonts.ready),
    page.waitForTimeout(5000),
  ])
}

test.describe('All-language localization rendering', () => {
  for (const locale of LOCALES) {
    test(`${locale.code.toUpperCase()} localized content renders`, async ({ page }) => {
      await selectLocale(page, locale)

      const bodyText = await page.evaluate(() => document.body.innerText)
      const foundCount = locale.expected.filter((word) => bodyText.includes(word)).length

      expect(foundCount).toBeGreaterThanOrEqual(1)
    })

    test(`${locale.code.toUpperCase()} has no UTF-8 mojibake`, async ({ page }) => {
      await selectLocale(page, locale)

      const bodyText = await page.evaluate(() => document.body.innerText)
      const found = MOJIBAKE_PATTERNS.filter((pattern) => bodyText.includes(pattern))

      expect(found).toEqual([])
    })

    if (locale.requiredChars) {
      test(`${locale.code.toUpperCase()} diacritic characters render`, async ({ page }) => {
        await selectLocale(page, locale)

        const bodyText = await page.evaluate(() => document.body.innerText)
        const foundCount = locale.requiredChars.filter((char) => bodyText.includes(char)).length

        expect(foundCount).toBeGreaterThanOrEqual(1)
      })
    }

    test(`${locale.code.toUpperCase()} heading and body fonts are applied`, async ({ page }) => {
      await selectLocale(page, locale)

      const h1 = page.getByRole('heading', { level: 1 }).first()
      await expect(h1).toBeVisible({ timeout: 10000 })

      const h1Font = await h1.evaluate((el) => window.getComputedStyle(el).fontFamily)
      const bodyFont = await page.locator('body').evaluate((el) => window.getComputedStyle(el).fontFamily)

      expect(h1Font.toLowerCase()).toContain('fraunces')
      expect(bodyFont.toLowerCase()).toContain('geist')
    })
  }
})
