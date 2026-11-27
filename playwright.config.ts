import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  expect: {
    timeout: 10000
  },
  fullyParallel: false,
  retries: 0,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"]
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER ? undefined : {
    command: "node scripts/playwright-static-server.cjs dist 4173",
    url: "http://127.0.0.1:4173/agents",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] }
    },
    {
      // Tablet portrait (800x1280), Chromium engine: runs wherever Chromium is installed.
      name: "chromium-tablet",
      use: { ...devices["Galaxy Tab S4"] }
    },
    /* Other engines. They need `npx playwright install firefox webkit` (with system deps on Linux) and are not part of
       the default CI job; run them with --project=firefox-desktop / webkit-desktop / mobile-safari. */
    {
      name: "firefox-desktop",
      use: { ...devices["Desktop Firefox"] }
    },
    {
      name: "webkit-desktop",
      use: { ...devices["Desktop Safari"] }
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] }
    }
  ]
});
