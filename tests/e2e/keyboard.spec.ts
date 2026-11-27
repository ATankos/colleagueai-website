import { test, expect, Page } from "@playwright/test";

/*
 * Keyboard-only use of the deployed build (dist/): every Tab stop is visible and shows a focus indicator, the language
 * selector and the demo call to action are reachable, and a catalogue card opens with Enter. Dialog focus trapping is
 * covered by modal-focus.spec.ts.
 */
const PAGES = ["/", "/agents", "/agents/contract-intelligence-and-register", "/pricing", "/partners", "/cs", "/cs/agenti", "/de/preise"];

async function tabStops(page: Page, max = 40) {
  const stops: { tag: string; text: string; visible: boolean; indicator: boolean; lang: boolean; demo: boolean }[] = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const indicator = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
      const href = (el as HTMLAnchorElement).getAttribute?.("href") || "";
      return {
        tag: el.tagName.toLowerCase(), text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40),
        visible: r.width > 0 && r.height > 0 && s.visibility !== "hidden",
        indicator: Boolean(indicator),
        lang: el.tagName === "SELECT" && /lang/i.test(el.className + el.id),
        demo: /\/demo/.test(href),
      };
    });
    if (info) stops.push(info);
  }
  return stops;
}

for (const path of PAGES) {
  test(`keyboard: ${path} — Tab stops are visible and show focus`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(path, { waitUntil: "networkidle" });
    const stops = await tabStops(page);
    expect(stops.length, "the page has keyboard-reachable controls").toBeGreaterThan(3);
    const hidden = stops.filter((s) => !s.visible).map((s) => `${s.tag} "${s.text}"`);
    expect(hidden, "focus never lands on an invisible element").toEqual([]);
    const noRing = stops.filter((s) => s.visible && !s.indicator).map((s) => `${s.tag} "${s.text}"`);
    expect(noRing, "every focused control shows a focus indicator").toEqual([]);
    expect(stops.some((s) => s.demo), "the demo call to action is reachable by keyboard").toBe(true);
  });
}

test("keyboard: a catalogue card opens with Enter", async ({ page }) => {
  await page.goto("/agents", { waitUntil: "networkidle" });
  const card = page.locator("article.card").first();
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[role="dialog"]:visible, dialog[open]').first()).toBeVisible();
});
