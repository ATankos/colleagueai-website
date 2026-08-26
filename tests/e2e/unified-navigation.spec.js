import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const BASE = (
  process.env.BASE_URL ??
  'http://127.0.0.1:4173'
).replace(/\/$/, '');

const ROOT =
  new URL('../../', import.meta.url);

const ROUTES =
  JSON.parse(
    fs.readFileSync(
      new URL(
        'i18n.routes.json',
        ROOT
      ),
      'utf8'
    )
  );

const CERT =
  JSON.parse(
    fs.readFileSync(
      new URL(
        'scripts/i18n/certified-content.json',
        ROOT
      ),
      'utf8'
    )
  );

const LOCALES = [
  'en',
  'cs',
  'de',
  'fr',
  'es',
  'it',
  'pl',
  'pt'
];

function href(loc, page) {
  const slug =
    ROUTES.slugs[page]?.[loc] ||
    ROUTES.slugs[page]?.en ||
    page;

  return loc === 'en'
    ? '/' + slug
    : '/' + loc + '/' + slug;
}


for (const loc of LOCALES) {

  test(
    `unified header exposes Certification in ${loc} desktop and mobile`,
    async ({ page }) => {

      const catalogue =
        href(loc, 'agents');

      const certification =
        href(loc, 'certified');

      /*
       * Desktop.
       */
      await page.setViewportSize({
        width: 1440,
        height: 900
      });

      await page.goto(
        BASE + catalogue,
        {
          waitUntil: 'networkidle'
        }
      );

      const header =
        page.locator(
          '.cai-uni-header'
        );

      await expect(
        header
      ).toBeVisible();

      const desktopCert =
        header.locator(
          `.cai-uni-links a[href="${certification}"]`
        );

      await expect(
        desktopCert
      ).toHaveCount(1);

      await expect(
        desktopCert
      ).toBeVisible();

      await expect(
        desktopCert
      ).toHaveText(
        CERT[loc].nav
      );


      /*
       * Mobile.
       */
      await page.setViewportSize({
        width: 390,
        height: 844
      });

      await page.reload({
        waitUntil: 'networkidle'
      });

      const burger =
        page.locator(
          '.cai-uni-burger'
        );

      await expect(
        burger
      ).toBeVisible();

      await burger.click();

      const mobileNav =
        page.locator(
          '.cai-uni-mnav'
        );

      await expect(
        mobileNav
      ).toHaveClass(
        /open/
      );

      await expect(
        mobileNav
      ).toBeVisible();

      const mobileCert =
        mobileNav.locator(
          `a[href="${certification}"]`
        );

      await expect(
        mobileCert
      ).toHaveCount(1);

      await expect(
        mobileCert
      ).toBeVisible();

      await expect(
        mobileCert
      ).toHaveText(
        CERT[loc].nav
      );
    }
  );
}


/*
 * Certification participates in the unified
 * language switch just like Catalogue/Pricing/etc.
 */
test(
  'Certification language switch preserves Certification page',
  async ({ page }) => {

    await page.setViewportSize({
      width: 1440,
      height: 900
    });

    await page.goto(
      BASE + '/certified',
      {
        waitUntil: 'networkidle'
      }
    );

    const selector =
      page.locator(
        '.cai-uni-links .cai-uni-lang'
      );

    await expect(
      selector
    ).toBeVisible();

    await selector.selectOption('/cs');

    await page.waitForURL(
      url =>
        url.pathname ===
        '/cs/certifikace'
    );

    expect(
      new URL(page.url()).pathname
    ).toBe(
      '/cs/certifikace'
    );

    await expect(
      page.locator(
        '.cai-uni-links a[href="/cs/certifikace"]'
      )
    ).toHaveText(
      CERT.cs.nav
    );
  }
);


/*
 * At intermediate widths the longer navigation
 * becomes the hamburger rather than overflowing.
 */
test(
  'unified header remains responsive around desktop breakpoint',
  async ({ page }) => {

    await page.setViewportSize({
      width: 1120,
      height: 800
    });

    await page.goto(
      BASE + '/de/agenten',
      {
        waitUntil: 'networkidle'
      }
    );

    await expect(
      page.locator(
        '.cai-uni-burger'
      )
    ).toBeVisible();

    await expect(
      page.locator(
        '.cai-uni-links'
      )
    ).toBeHidden();

    let dims =
      await page.evaluate(() => ({
        client:
          document.documentElement.clientWidth,

        scroll:
          document.documentElement.scrollWidth
      }));

    expect(
      dims.scroll
    ).toBeLessThanOrEqual(
      dims.client + 2
    );


    /*
     * One pixel above the breakpoint:
     * desktop nav returns and must still fit.
     */
    await page.setViewportSize({
      width: 1121,
      height: 800
    });

    await page.reload({
      waitUntil: 'networkidle'
    });

    await expect(
      page.locator(
        '.cai-uni-links'
      )
    ).toBeVisible();

    dims =
      await page.evaluate(() => ({
        client:
          document.documentElement.clientWidth,

        scroll:
          document.documentElement.scrollWidth
      }));

    expect(
      dims.scroll
    ).toBeLessThanOrEqual(
      dims.client + 2
    );
  }
);


/*
 * Regression for the verified 390 -> 430px
 * /imprint overflow.
 */
test(
  'mobile imprint fits viewport and header is full width',
  async ({ page }) => {

    await page.setViewportSize({
      width: 390,
      height: 844
    });

    await page.goto(
      BASE + '/imprint',
      {
        waitUntil: 'networkidle'
      }
    );

    const dims =
      await page.evaluate(() => {

        const root =
          document.documentElement;

        const body =
          document.body.getBoundingClientRect();

        const header =
          document
            .querySelector('.cai-uni-header')
            ?.getBoundingClientRect();

        const main =
          document
            .querySelector('main')
            ?.getBoundingClientRect();

        return {
          client:
            root.clientWidth,

          scroll:
            root.scrollWidth,

          bodyLeft:
            Math.round(body.left),

          bodyRight:
            Math.round(body.right),

          bodyWidth:
            Math.round(body.width),

          headerLeft:
            header
              ? Math.round(header.left)
              : null,

          headerRight:
            header
              ? Math.round(header.right)
              : null,

          mainRight:
            main
              ? Math.round(main.right)
              : null
        };
      });

    expect(
      dims.scroll
    ).toBeLessThanOrEqual(
      dims.client + 2
    );

    expect(
      dims.bodyWidth
    ).toBeLessThanOrEqual(
      dims.client
    );

    expect(
      dims.headerLeft
    ).toBe(0);

    expect(
      dims.headerRight
    ).toBe(
      dims.client
    );

    expect(
      dims.mainRight
    ).toBeLessThanOrEqual(
      dims.client
    );
  }
);

