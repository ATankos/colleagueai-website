import { expect, test } from "@playwright/test";

test.describe("QA: back-to-top UX", () => {
  test("back-to-top injected button materially reduces scroll position", async ({ page }) => {
    await page.goto("/agents", { waitUntil: "networkidle" });

    const injected = page.locator("#cai-fixed-backtop, #cai-working-back-to-top");
    await expect(injected.last()).toBeVisible({ timeout: 10000 });

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      window.dispatchEvent(new Event("scroll"));
    });

    await page.waitForTimeout(500);

    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(200);

    await injected.last().click();
    await page.waitForTimeout(1200);

    const after = await page.evaluate(() => window.scrollY);

    expect(after).toBeLessThan(before);
    expect(after).toBeLessThan(Math.max(300, before * 0.25));
  });
});
