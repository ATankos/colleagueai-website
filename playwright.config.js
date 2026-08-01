// UNUSED BY CI. Playwright resolves playwright.config.ts ahead of this file, so
// `npm run e2e` uses the .ts config (chromium-desktop + mobile-chrome, served
// from dist/ with vercel.json routing). This file targets a local `npm run dev`
// server and declares Firefox/WebKit projects that CI does not install browsers
// for. Kept for local multi-browser runs via: npx playwright test -c playwright.config.js
import { defineConfig, devices } from '@playwright/test'

// Local dev config — runs `npm run dev` and tests against http://localhost:5173
// Used by: `npm run e2e`
export default defineConfig({
  testDir: './e2e',
  // Don't auto-collect production smoke tests
  testIgnore: ['**/prod-smoke.spec.js'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
