/**
 * Pins the routing contract for the SPA bundle.
 *
 * Why this file exists: an audit found that the repo's only unit tests rendered
 * ColleagueAIMarketplace, a component no production URL can reach. vercel.json
 * serves demo.html at exactly eight sources — /demo and its seven locale
 * variants — and App routes every one of those to <Demo />. The marketplace is
 * the fallback branch, and nothing falls back to it.
 *
 * That is worth a test rather than a comment. If someone widens the rewrites or
 * narrows the route pattern, one of these fails and says so, instead of the
 * booking form quietly disappearing behind a marketplace view for one locale —
 * which is the exact bug the CAI-001 fix had to repair once already.
 */
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import App from './App.jsx'

// Both leaves are stubbed: this file is about which branch is taken, and the
// real marketplace component is 47 KB of unrelated markup.
vi.mock('./Demo.jsx', () => ({ default: () => <div data-testid="demo" /> }))
vi.mock('./ColleagueAIMarketplace.jsx', () => ({ default: () => <div data-testid="marketplace" /> }))

/** Every source vercel.json rewrites to demo.html. Keep these in sync. */
const DEMO_ROUTES = ['/demo', '/cs/demo', '/de/demo', '/fr/demo', '/es/demo', '/it/demo', '/pl/demo', '/pt/demo']

function visit(path) {
  window.history.pushState({}, '', path)
}

afterEach(() => visit('/'))

describe('App routing', () => {
  it.each(DEMO_ROUTES)('serves the booking form at %s', (path) => {
    visit(path)
    render(<App />)

    expect(screen.getByTestId('demo')).toBeInTheDocument()
    expect(screen.queryByTestId('marketplace')).not.toBeInTheDocument()
  })

  it('tolerates a trailing slash on a demo route', () => {
    visit('/de/demo/')
    render(<App />)

    expect(screen.getByTestId('demo')).toBeInTheDocument()
  })

  it('does not mistake a nested path for the demo route', () => {
    visit('/demo/extra')
    render(<App />)

    expect(screen.queryByTestId('demo')).not.toBeInTheDocument()
  })

  it('does not treat an unsupported locale prefix as a demo route', () => {
    visit('/xx/demo')
    render(<App />)

    expect(screen.queryByTestId('demo')).not.toBeInTheDocument()
  })
})
