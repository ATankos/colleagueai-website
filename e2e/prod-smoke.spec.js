import { test, expect } from '@playwright/test'

// PRODUCTION SMOKE TESTS
// Hits https://colleagueai.ai directly. Run sparingly — after each deploy.
// Use: `npm run e2e:prod`

test('live site responds with 200 and HTTPS', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  expect(page.url()).toMatch(/^https:\/\//)
})

test('live site renders hero', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/actually/i)
})

test('live site language toggle works end-to-end', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'CS' }).click()
  await expect(page.getByRole('link', { name: 'Filozofie' }).first()).toBeVisible()
})
