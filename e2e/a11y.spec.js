import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// ACCESSIBILITY TESTS
// Runs the Deque axe-core engine against the live DOM.
// Target: WCAG 2.1 Level A + AA, including best practices.
//
// Why only chromium: axe results are engine-agnostic — running across
// 5 browser projects would multiply CI time without finding new issues.
// The DOM is the DOM.

const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function runAxe(page) {
  return new AxeBuilder({ page })
    .withTags(A11Y_TAGS)
    .analyze()
}

// Pretty-print violations so test failures are actionable, not just a stack trace
function formatViolations(violations) {
  return violations
    .map((v, i) => {
      const nodes = v.nodes
        .slice(0, 3) // limit per-rule node dump
        .map((n) => `    - ${n.html}\n      ${n.failureSummary || ''}`)
        .join('\n')
      return [
        `\n[${i + 1}] ${v.id} (${v.impact}) — ${v.help}`,
        `    Tags: ${v.tags.join(', ')}`,
        `    Help: ${v.helpUrl}`,
        `    Affected nodes (${v.nodes.length}):`,
        nodes,
      ].join('\n')
    })
    .join('\n')
}

test.describe('Accessibility — WCAG 2.1 AA', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for webfonts to load
    await page.evaluate(() => document.fonts.ready)
    // Disable CSS animations and transitions so axe doesn't scan mid-fade,
    // which would report misleading "low contrast" due to partial opacity
    await page.addStyleTag({
      content: `*, *::before, *::after {
        animation: none !important;
        transition: none !important;
        opacity: 1 !important;
      }`,
    })
    await page.waitForTimeout(200)
  })

  test('homepage has no a11y violations in English', async ({ page }) => {
    const results = await runAxe(page)
    if (results.violations.length > 0) {
      console.log('\nAxe violations:\n' + formatViolations(results.violations))
    }
    expect(results.violations, formatViolations(results.violations)).toEqual([])
  })

  test('homepage has no a11y violations in Czech', async ({ page }) => {
    await page.getByRole('button', { name: 'CS', exact: true }).click()
    // Re-wait after re-render
    await page.waitForTimeout(200)

    const results = await runAxe(page)
    if (results.violations.length > 0) {
      console.log('\nAxe violations (CS):\n' + formatViolations(results.violations))
    }
    expect(results.violations, formatViolations(results.violations)).toEqual([])
  })
})
