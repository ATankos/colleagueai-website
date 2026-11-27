import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/*
 * WCAG 2.1 A/AA (axe-core) on the DEPLOYED build (dist/, served with the vercel.json routing), for the pages a buyer
 * walks through, in all eight languages. e2e/a11y.spec.js audits the Vite dev server's React page instead, which is not
 * what production serves at "/".
 */
const PAGES: Record<string, string[]> = {
  en: ["/", "/agents", "/agents/contract-intelligence-and-register", "/pricing", "/certified", "/partners", "/demo", "/trust"],
  cs: ["/cs", "/cs/agenti", "/cs/cenik", "/cs/certifikace", "/cs/partneri", "/cs/demo"],
  de: ["/de", "/de/agenten", "/de/preise", "/de/zertifizierung", "/de/partner", "/de/demo"],
  fr: ["/fr", "/fr/agents", "/fr/tarifs", "/fr/certification", "/fr/partenaires", "/fr/demo"],
  es: ["/es", "/es/agentes", "/es/precios", "/es/certificacion", "/es/socios", "/es/demo"],
  it: ["/it", "/it/agenti", "/it/prezzi", "/it/certificazione", "/it/partner", "/it/demo"],
  pl: ["/pl", "/pl/agenci", "/pl/cennik", "/pl/certyfikacja", "/pl/partnerzy", "/pl/demo"],
  pt: ["/pt", "/pt/agentes", "/pt/precos", "/pt/certificacao", "/pt/parceiros", "/pt/demo"],
};

for (const [lang, paths] of Object.entries(PAGES)) {
  for (const path of paths) {
    test(`a11y ${lang} ${path}`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: "networkidle" });
      expect(res?.status(), `${path} should load`).toBeLessThan(400);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const summary = results.violations.map((v) =>
        `${v.id} (${v.impact}): ${v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} :: ${(n.any[0]?.message ?? n.failureSummary ?? "").slice(0, 160)}`).join(" | ")}`);
      expect(summary, summary.join("\n")).toEqual([]);
    });
  }
}
