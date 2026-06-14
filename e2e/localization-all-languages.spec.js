import { test, expect } from '@playwright/test'

const MOJIBAKE_PATTERNS = [
  'Ã¡',
  'Ã©',
  'Ã­',
  'Ã³',
  'Ãº',
  'Ã½',
  'Ã¢',
  'Ãª',
  'Ãµ',
  'Ã§',
  'Ä›',
  'Å™',
  'Å¡',
  'Å¾',
  'Å¯',
  'Ä…',
  'Ä‡',
  'Å‚',
  'Å„',
  'Å›',
  'Åº',
  'Å¼',
]

const LOCALES = [
  {
    code: 'en',
    expected: ['Marketplace', 'Pricing', 'AI agents', 'actually deploy'],
  },
  {
    code: 'cs',
    expected: ['Filozofie', 'Ceník', 'skutečně', 'Certifikovaní', 'Připraveni'],
    requiredChars: ['á', 'č', 'é', 'í', 'ě', 'ř', 'š', 'ú', 'ů', 'ý', 'ž'],
  },
  {
    code: 'de',
    expected: ['Philosophie', 'Preise', 'wirklich', 'können'],
    requiredChars: ['ö', 'ü'],
  },
  {
    code: 'fr',
    expected: ['Philosophie', 'Tarifs', 'déployer', 'certifiés', 'conformité', 'opérations'],
    requiredChars: ['é', 'è', 'à'],
  },
  {
    code: 'es',
    expected: ['Filosofía', 'Precios', 'Contacto', 'producción', 'auditoría'],
    requiredChars: ['í', 'ó', 'á'],
  },
  {
    code: 'it',
    expected: ['Filosofia', 'Prezzi', 'Contatti', 'davvero', 'operazioni'],
  },
  {
    code: 'pl',
    expected: ['Filozofia', 'Cennik', 'wdrożyć', 'audyt', 'Prywatność'],
    requiredChars: ['ć', 'ż', 'ź', 'ó', 'ń'],
  },
  {
    code: 'pt',
    expected: ['Filosofia', 'Preços', 'Contacto', 'produção', 'auditoria', 'Privacidade'],
    requiredChars: ['ç', 'ã', 'í', 'ó'],
  },
]

async function selectLocale(page, code) {
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
      } catch { /* intentionally ignored */ }
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
    } catch { /* intentionally ignored */ }
  }

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })

  for (const option of optionCandidates) {
    try {
      if ((await option.count()) > 0 && await option.first().isVisible()) {
        await option.first().click({ timeout: 5000 })
        await page.waitForTimeout(500)
        break
      }
    } catch { /* intentionally ignored */ }
  }

  const option = page
    .getByRole('button', { name: new RegExp(`\\b${code.toUpperCase()}\\b`, 'i') })
    .first()

  await expect(option).toBeVisible({ timeout: 10000 })
  await option.click()

  await page.waitForTimeout(300)

  await Promise.race([
    page.evaluate(() => document.fonts && document.fonts.ready),
    page.waitForTimeout(5000),
  ])
}

test.describe('All-language localization rendering', () => {
  for (const locale of LOCALES) {
    test(`${locale.code.toUpperCase()} localized content renders`, async ({ page }) => {
      await selectLocale(page, locale.code)

      const bodyText = await page.evaluate(() => document.body.innerText)
      const missingWords = locale.expected.filter((word) => !bodyText.includes(word))

      expect(
        missingWords,
        `${locale.code.toUpperCase()} missing expected localized words: ${missingWords.join(', ')}`
      ).toEqual([])
    })

    test(`${locale.code.toUpperCase()} has no UTF-8 mojibake`, async ({ page }) => {
      await selectLocale(page, locale.code)

      const bodyText = await page.evaluate(() => document.body.innerText)
      const found = MOJIBAKE_PATTERNS.filter((pattern) => bodyText.includes(pattern))

      expect(
        found,
        `${locale.code.toUpperCase()} mojibake sequences found: ${found.join(', ')}`
      ).toEqual([])
    })

    if (locale.requiredChars) {
      test(`${locale.code.toUpperCase()} diacritic characters render`, async ({ page }) => {
        await selectLocale(page, locale.code)

        const bodyText = await page.evaluate(() => document.body.innerText)
        const missingChars = locale.requiredChars.filter((char) => !bodyText.includes(char))

        expect(
          missingChars,
          `${locale.code.toUpperCase()} missing diacritic characters: ${missingChars.join(', ')}`
        ).toEqual([])
      })
    }

    test(`${locale.code.toUpperCase()} heading and body fonts are applied`, async ({ page }) => {
      await selectLocale(page, locale.code)

      const h1 = page.getByRole('heading', { level: 1 }).first()
      await expect(h1).toBeVisible({ timeout: 10000 })

      const h1Font = await h1.evaluate((el) => window.getComputedStyle(el).fontFamily)
      const bodyFont = await page.locator('body').evaluate((el) => window.getComputedStyle(el).fontFamily)

      expect(
        h1Font.toLowerCase(),
        `${locale.code.toUpperCase()} expected Fraunces heading font, got: ${h1Font}`
      ).toContain('fraunces')

      expect(
        bodyFont.toLowerCase(),
        `${locale.code.toUpperCase()} expected Geist body font, got: ${bodyFont}`
      ).toContain('geist')
    })
  }
})


