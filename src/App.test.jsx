/**
 * Pins the contract between vercel.json and the SPA bundle.
 *
 * demo.html is served at exactly eight sources — /demo and its seven locale
 * variants — and every one of them must render the booking form. App used to
 * branch: those eight paths got <Demo />, anything else got a marketplace view.
 * Nothing was ever routed to "anything else", so that branch was unreachable and
 * the 47 KB component behind it was dead code. Both are gone.
 *
 * The test stays, because the risk it covers is still real and has bitten once
 * before: a visitor reaching this bundle on a path the app does not expect and
 * getting something other than the booking form. If someone widens the rewrites
 * or reintroduces branching, this is where it surfaces.
 */
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import App from './App.jsx'

// Demo has its own suite; here only the mounting matters.
vi.mock('./Demo.jsx', () => ({ default: () => <div data-testid="demo" /> }))

/** Every source vercel.json rewrites to demo.html. Keep these in sync. */
const DEMO_ROUTES = ['/demo', '/cs/demo', '/de/demo', '/fr/demo', '/es/demo', '/it/demo', '/pl/demo', '/pt/demo']

function visit(path) {
  window.history.pushState({}, '', path)
}

afterEach(() => visit('/'))

describe('App', () => {
  it.each(DEMO_ROUTES)('serves the booking form at %s', (path) => {
    visit(path)
    render(<App />)

    expect(screen.getByTestId('demo')).toBeInTheDocument()
  })

  it('serves the booking form regardless of trailing slash', () => {
    visit('/de/demo/')
    render(<App />)

    expect(screen.getByTestId('demo')).toBeInTheDocument()
  })

  it('still serves the booking form on a path the rewrites do not currently use', () => {
    // Not a route today. Asserted anyway: whatever reaches this bundle should be
    // the booking form, never a blank screen or some other view. This is the
    // regression the removed marketplace branch used to cause for non-English
    // visitors, and the reason the branch is not coming back.
    visit('/demo/extra')
    render(<App />)

    expect(screen.getByTestId('demo')).toBeInTheDocument()
  })
})
