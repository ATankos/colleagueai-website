import { expect, test } from "@playwright/test";

test.describe("QA: back-to-top UX", () => {
  test("back-to-top injected button materially reduces scroll position", async ({ page }) => {
    await page.goto("/agents", { waitUntil: "networkidle" });

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      window.dispatchEvent(new Event("scroll"));
    });

    await page.waitForTimeout(700);

    // Read the same value the implementation actually zeroes. forceTop() clears
    // scrollTop on document.scrollingElement, documentElement and body; reading
    // only window.scrollY misses whichever element is the scrolling box, which
    // varies with viewport and with body{overflow-y:auto} on the catalogue page.
    const readY = () =>
      page.evaluate(() =>
        Math.round(
          (document.scrollingElement && document.scrollingElement.scrollTop) ||
            window.scrollY ||
            document.documentElement.scrollTop ||
            document.body.scrollTop ||
            0,
        ),
      );

    const before = await readY();
    expect(before).toBeGreaterThan(200);

    const injected = page.locator("#cai-fixed-backtop, #cai-working-back-to-top").last();
    await expect(injected).toBeVisible({ timeout: 10000 });

    await injected.click({ force: true });

    // forceTop() retries on rAF and on 50ms/150ms timers, so poll for the result
    // instead of sampling once after a fixed wait. Still fails if the button
    // genuinely does not return the reader to the top.
    await expect.poll(readY, { timeout: 5000 }).toBeLessThan(Math.max(300, before * 0.25));
    expect(await readY()).toBeLessThan(before);
  });
});
