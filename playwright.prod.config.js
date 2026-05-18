import { defineConfig, devices } from '@playwright/test'

// Production smoke-test config — runs against live https://colleagueai.ai
// Used by: `npm run e2e:prod`
// Only runs tests matching prod-smoke.spec.js to keep production hits minimal.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/prod-smoke.spec.js'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'https://colleagueai.ai',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
