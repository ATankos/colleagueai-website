import { test, expect } from '@playwright/test'

// Helper: detect whether the current project is a mobile device profile
const isMobile = (testInfo) => testInfo.project.name.startsWith('mobile-')

test.describe('Colleague AI marketing site', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('loads the hero on first paint', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/actually/i)
  })

  test('nav links scroll to in-page sections', async ({ page }, testInfo) => {
    // Top nav is hidden on mobile (via .hide-mobile class) — skip there.
    // Mobile nav coverage lives in the "Mobile viewport" describe below.
    test.skip(isMobile(testInfo), 'Top nav is hidden at mobile widths by design')

    await page.getByRole('link', { name: 'Marketplace' }).first().click()
    await expect(page).toHaveURL(/#marketplace$/)
    await expect(page.locator('#marketplace')).toBeInViewport()
  })

  test('EN/CS language toggle swaps the nav copy', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'Nav links are hidden at mobile widths by design')

    // English by default
    await expect(page.getByRole('link', { name: 'Philosophy' })).toBeVisible()

    // exact: true — otherwise "EN" matches Czech filter pills like "Všichni agentů"
    await page.getByRole('button', { name: 'EN', exact: true }) // confirm we can target it precisely
    await page.getByRole('button', { name: 'CS', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Filozofie' })).toBeVisible()

    await page.getByRole('button', { name: 'EN', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Philosophy' })).toBeVisible()
  })

  test('marketplace filter narrows the agent grid', async ({ page }) => {
    await page.locator('#marketplace').scrollIntoViewIfNeeded()

    // Target the agent NAME (h3) specifically, not the description paragraph,
    // since the agent name also appears inside the description text.
    const monthEndClose = page.getByRole('heading', { name: 'Month-End Close' })
    const kycWorkflow  = page.getByRole('heading', { name: 'KYC Workflow' })

    await expect(monthEndClose).toBeVisible()
    await expect(kycWorkflow).toBeVisible()

    await page.getByRole('button', { name: 'Finance', exact: true }).click()

    await expect(monthEndClose).toBeVisible()
    await expect(kycWorkflow).toHaveCount(0)
  })

  test('pricing section renders', async ({ page }) => {
    await page.locator('#pricing').scrollIntoViewIfNeeded()
    await expect(page.locator('#pricing')).toBeVisible()
    await expect(page.locator('#pricing')).not.toBeEmpty()
  })

  test('contact section renders', async ({ page }) => {
    await page.locator('#contact').scrollIntoViewIfNeeded()
    await expect(page.locator('#contact')).toBeVisible()
  })
})

test.describe('Mobile viewport', () => {
  test('site renders and language toggle works on mobile', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'Runs only under mobile device projects')

    await page.goto('/')
    // Hero renders
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Language toggle is in the top bar (not in .hide-mobile), so still visible & tappable on mobile
    await expect(page.getByRole('button', { name: 'CS', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'CS', exact: true }).click()
    // After toggling to CS, Czech hero appears — we look for the Czech eyebrow which is uppercase + accented
    await expect(page.getByText(/PŘEDSTAVUJEME/)).toBeVisible()
  })

  test('marketplace section is reachable by scroll on mobile', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'Runs only under mobile device projects')

    await page.goto('/')
    await page.locator('#marketplace').scrollIntoViewIfNeeded()
    await expect(page.locator('#marketplace')).toBeInViewport()
  })
})
