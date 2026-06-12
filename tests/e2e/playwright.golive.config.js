// Config for the go-live harness only. Run:
//   BASE_URL=https://www.colleagueai.ai npx playwright test -c tests/e2e/playwright.golive.config.js
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'golive.spec.js',
  timeout: 45000,
  retries: 1,
  reporter: [['list'], ['json', { outputFile: '../results/golive-e2e.json' }]],
  use: { ...devices['Desktop Chrome'], baseURL: process.env.BASE_URL ?? 'http://localhost:4173' },
});
