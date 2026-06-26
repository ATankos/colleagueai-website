import { expect, test } from "@playwright/test";

const locales = ["en", "cs", "de", "fr", "es", "it", "pl", "pt"];
const nonEnglishLocales = locales.filter((locale) => locale !== "en");
const pages = ["agents", "trust", "partners", "privacy", "terms"];

const expectedMarkers = {
  trust: {
    cs: ["Centrum duvery", "Metodika CAI Score"],
    de: ["Vertrauenszentrum", "Methodik des CAI Score"],
    fr: ["Centre de confiance", "Methodologie du CAI Score"],
    es: ["Centro de confianza", "Metodologia del CAI Score"],
    it: ["Centro fiducia", "Metodologia del CAI Score"],
    pl: ["Centrum zaufania", "Metodyka CAI Score"],
    pt: ["Centro de confianca", "Metodologia do CAI Score"]
  },
  partners: {
    cs: ["Schvaleni partneri", "Zadejte sve jmeno"],
    de: ["Genehmigte Partner", "Geben Sie Ihren Namen"],
    fr: ["partenaires approuves", "Saisissez votre nom"],
    es: ["partners aprobados", "Introduce tu nombre"],
    it: ["partner approvati", "Inserisci nome"],
    pl: ["Zatwierdzeni partnerzy", "Podaj imie"],
    pt: ["Parceiros aprovados", "Introduza o seu nome"]
  }
};

function localizedPath(locale, pageName) {
  return locale === "en" ? `/${pageName}` : `/${locale}/${pageName}`;
}

async function visibleText(page) {
  return await page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, svg").forEach((node) => node.remove());
    return clone.innerText || clone.textContent || "";
  });
}

test.describe("QA: page health", () => {
  for (const locale of locales) {
    for (const pageName of pages) {
      test(`${locale}/${pageName} loads with title, h1 and body`, async ({ page }) => {
        const errors = [];

        page.on("console", (msg) => {
          if (msg.type() === "error") errors.push(msg.text());
        });

        page.on("pageerror", (error) => {
          errors.push(error.message);
        });

        const response = await page.goto(localizedPath(locale, pageName), {
          waitUntil: "networkidle"
        });

        expect(response?.ok(), `${locale}/${pageName} should load`).toBeTruthy();
        await expect(page.locator("body")).toBeVisible();

        expect((await page.title()).trim().length).toBeGreaterThan(5);
        expect(await page.locator("h1").count()).toBeGreaterThan(0);
        expect((await visibleText(page)).length).toBeGreaterThan(300);
        expect(errors).toEqual([]);
      });
    }
  }
});

test.describe("QA: locale routing and language integrity", () => {
  for (const locale of locales) {
    for (const pageName of pages) {
      test(`${locale}/${pageName} has correct html lang and no unsupported SK locale`, async ({ page }) => {
        await page.goto(localizedPath(locale, pageName), { waitUntil: "networkidle" });

        const htmlLang = await page.locator("html").getAttribute("lang");
        expect(htmlLang?.toLowerCase().startsWith(locale)).toBeTruthy();

        const html = await page.content();
        expect(html).not.toMatch(/\/sk\//i);
        expect(html).not.toMatch(/locale["']?\s*:\s*["']sk["']/i);
        expect(html).not.toMatch(/Slovenčina|Slovencina|Slovak/i);
      });
    }
  }

  for (const pageName of pages) {
    test(`${pageName} direct localized routes work for all supported locales`, async ({ page }) => {
      for (const locale of locales) {
        const response = await page.goto(localizedPath(locale, pageName), {
          waitUntil: "networkidle"
        });

        expect(response?.ok(), `${locale}/${pageName} should load`).toBeTruthy();

        const htmlLang = await page.locator("html").getAttribute("lang");
        expect(htmlLang?.toLowerCase().startsWith(locale)).toBeTruthy();
      }
    });
  }

  for (const pageName of ["trust", "partners"]) {
    for (const locale of nonEnglishLocales) {
      test(`${locale}/${pageName} contains expected localized marker`, async ({ page }) => {
        await page.goto(localizedPath(locale, pageName), { waitUntil: "networkidle" });

        const text = (await visibleText(page)).toLowerCase();
        const markers = expectedMarkers[pageName]?.[locale] || [];

        expect(markers.some((marker) => text.includes(marker.toLowerCase()))).toBeTruthy();
      });
    }
  }
});

test.describe("QA: encoding, placeholder and language-mishmash checks", () => {
  const hardBadPatterns = [
    /Ã[\u0080-\u00bf]/,
    /�/,
    /\[object Object\]/,
    /\bundefined\b/,
    /null null/
  ];

  for (const locale of locales) {
    for (const pageName of pages) {
      test(`${locale}/${pageName} has no hard visible-text defects`, async ({ page }) => {
        await page.goto(localizedPath(locale, pageName), { waitUntil: "networkidle" });

        const text = await visibleText(page);

        for (const pattern of hardBadPatterns) {
          expect(text).not.toMatch(pattern);
        }

        expect(text).not.toMatch(/\bFIXME\b|lorem ipsum/i);
      });
    }
  }

  for (const locale of nonEnglishLocales) {
    for (const pageName of ["agents", "trust", "partners"]) {
      test(`${locale}/${pageName} is not English-only`, async ({ page }) => {
        await page.goto(localizedPath(locale, pageName), { waitUntil: "networkidle" });

        const text = (await visibleText(page)).toLowerCase();

        const englishSignals = [
          "approved partners can refer",
          "the evidence, in one place",
          "ready to bring enterprise ai",
          "enter your name and email"
        ];

        const hits = englishSignals.filter((signal) => text.includes(signal)).length;
        expect(hits).toBeLessThanOrEqual(1);
      });
    }
  }
});

test.describe("QA: UAT and functionality", () => {
  test("core public routes are reachable", async ({ page }) => {
    for (const route of ["/", "/agents", "/trust", "/partners", "/privacy", "/terms"]) {
      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response?.ok(), `${route} should load`).toBeTruthy();
      await expect(page.locator("body")).toBeVisible();
    }
  });

  for (const pageName of ["agents", "trust", "partners"]) {
    test(`${pageName} exposes at least one visible CTA`, async ({ page }) => {
      await page.goto(`/${pageName}`, { waitUntil: "networkidle" });

      const ctas = page.locator("a:visible, button:visible").filter({
        hasText: /book|pilot|demo|contact|start|partner|agent|buy|schedule|apply|submit|get/i
      });

      expect(await ctas.count()).toBeGreaterThan(0);
    });
  }
});
