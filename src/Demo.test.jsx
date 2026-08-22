/**
 * Tests for the /demo booking form.
 *
 * Demo.jsx is what every visitor to /demo and its seven localised variants
 * actually sees, and it is the component the CAI-001 fix rewrote. Until now the
 * only unit tests in the repo rendered ColleagueAIMarketplace, which no route
 * reaches, so this file is the first coverage the live page has had.
 *
 * These assert behaviour a visitor would notice: that the fields exist and are
 * required, that typing is recorded, that submitting posts the right payload to
 * the right endpoint, and — the part that matters most on a lead form — that a
 * failed submission keeps their answers on screen instead of discarding them.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import Demo from './Demo.jsx'

const ENDPOINT = '/api/demo-booking'

/** Demo reads window.location.pathname to pick its locale. */
function visit(path) {
  window.history.pushState({}, '', path)
}

/**
 * Fill everything the form marks required, so submission is realistic.
 * The date field is set with fireEvent rather than typed: date inputs take
 * their value wholesale, and keystroke simulation on them is brittle.
 */
async function fillRequiredFields(user, over = {}) {
  const values = { email: 'cfo@example.com', company: 'Example Bank', role: 'CFO', date: '2026-09-15', ...over }
  await user.type(screen.getByLabelText(/email/i), values.email)
  await user.type(screen.getByLabelText(/company/i), values.company)
  await user.type(screen.getByLabelText(/your role/i), values.role)
  fireEvent.change(document.getElementById('preferredDate'), { target: { value: values.date } })
  return values
}

const submitButton = () => screen.getByRole('button', { name: /request demo|submitting/i })

let fetchMock

beforeEach(() => {
  visit('/demo')
  fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  visit('/')
})

describe('Demo booking form', () => {
  it('renders every field the form requires', () => {
    render(<Demo />)

    for (const id of ['email', 'company', 'role', 'preferredDate']) {
      const field = document.getElementById(id)
      expect(field, `#${id} should exist`).toBeInTheDocument()
      // Assert the native attribute by name rather than via toBeRequired():
      // that matcher is satisfied by aria-required alone, so dropping the real
      // `required` — the one that actually blocks a bad submission — would slip
      // through. Both are asserted because they do different jobs: `required`
      // stops the submit, `aria-required` is what a screen reader announces.
      expect(field).toHaveAttribute('required')
      expect(field).toHaveAttribute('aria-required', 'true')
    }

    expect(document.getElementById('email')).toHaveAttribute('type', 'email')
    expect(document.getElementById('preferredDate')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText(/time zone/i).tagName).toBe('SELECT')
  })

  it('offers the five catalogue pillars as areas of interest', () => {
    render(<Demo />)

    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(5)
    for (const label of [
      /operations & service/i,
      /risk, security & compliance/i,
      /data & infrastructure/i,
      /sales & marketing/i,
      /corporate/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    // Nothing is preselected — the visitor opts in.
    expect(boxes.every((b) => !b.checked)).toBe(true)
  })

  it('records what the visitor types', async () => {
    const user = userEvent.setup()
    render(<Demo />)

    const values = await fillRequiredFields(user)

    expect(screen.getByLabelText(/email/i)).toHaveValue(values.email)
    expect(screen.getByLabelText(/company/i)).toHaveValue(values.company)
    expect(screen.getByLabelText(/your role/i)).toHaveValue(values.role)
    expect(document.getElementById('preferredDate')).toHaveValue(values.date)
  })

  it('toggles an area of interest on and back off', async () => {
    const user = userEvent.setup()
    render(<Demo />)

    const risk = screen.getByLabelText(/risk, security & compliance/i)
    expect(risk).not.toBeChecked()

    await user.click(risk)
    expect(risk).toBeChecked()

    await user.click(risk)
    expect(risk).not.toBeChecked()
  })

  it('posts the booking to the demo endpoint', async () => {
    const user = userEvent.setup()
    render(<Demo />)

    const values = await fillRequiredFields(user)
    await user.click(screen.getByLabelText(/data & infrastructure/i))
    await user.click(submitButton())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(ENDPOINT)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })

    const payload = JSON.parse(init.body)
    expect(payload).toMatchObject({
      email: values.email,
      company: values.company,
      role: values.role,
      preferredDate: values.date,
      agentsOfInterest: ['data'],
    })
    expect(payload.timeZone).toBeTruthy()
  })

  it('confirms the booking and retires the form on success', async () => {
    const user = userEvent.setup()
    render(<Demo />)

    await fillRequiredFields(user)
    await user.click(submitButton())

    const confirmation = await screen.findByRole('status')
    expect(confirmation).toHaveTextContent(/demo request received/i)
    expect(confirmation).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('button', { name: /request demo/i })).not.toBeInTheDocument()
  })

  it('keeps the visitor’s answers on screen when the server rejects the booking', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({ ok: false })
    render(<Demo />)

    const values = await fillRequiredFields(user)
    await user.click(submitButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/failed to submit/i)

    // The whole point: they can retry without retyping.
    expect(screen.getByLabelText(/email/i)).toHaveValue(values.email)
    expect(screen.getByLabelText(/company/i)).toHaveValue(values.company)
    expect(submitButton()).toBeEnabled()
  })

  it('explains the problem when the request never reaches the server', async () => {
    const user = userEvent.setup()
    fetchMock.mockRejectedValue(new Error('network down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<Demo />)

    await fillRequiredFields(user)
    await user.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to submit/i)
    expect(submitButton()).toBeEnabled()
  })

  it('disables the submit button while the booking is in flight', async () => {
    const user = userEvent.setup()
    let release
    fetchMock.mockReturnValue(new Promise((resolve) => { release = () => resolve({ ok: true }) }))
    render(<Demo />)

    await fillRequiredFields(user)
    await user.click(submitButton())

    await waitFor(() => expect(submitButton()).toBeDisabled())
    expect(submitButton()).toHaveTextContent(/submitting/i)

    release()
    await screen.findByRole('status')
  })
})

describe('Demo agent context', () => {
  it('names the agent the visitor came from', () => {
    visit('/demo?agent=reconciliation-root-cause-agent&tier=L3')
    render(<Demo />)

    expect(screen.getByText(/You are requesting/i)).toBeInTheDocument()
    expect(screen.getByText('Reconciliation Root Cause Agent')).toBeInTheDocument()
    expect(screen.getByText(/CAI L3/)).toBeInTheDocument()
  })

  it('submits the agent with the booking, so sales is not left guessing', async () => {
    const user = userEvent.setup()
    visit('/demo?agent=contract-summarisation-agent&tier=L4')
    render(<Demo />)

    await fillRequiredFields(user)
    await user.click(submitButton())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.agentSlug).toBe('contract-summarisation-agent')
    expect(payload.agentTier).toBe('L4')
  })

  it('shows the indicative one-time package price for the tier, matching /pricing', () => {
    visit('/demo?agent=reconciliation-root-cause-agent&tier=L3')
    render(<Demo />)

    expect(screen.getByText(/Indicative package price: \$25,000 \(one-time\)/)).toBeInTheDocument()
  })

  it('shows no price for a tier that is not sold', () => {
    visit('/demo?agent=reconciliation-root-cause-agent&tier=L1')
    render(<Demo />)

    expect(screen.getByText(/You are requesting/i)).toBeInTheDocument()
    expect(screen.queryByText(/Indicative package price/)).not.toBeInTheDocument()
  })

  it('ignores a query string that is not catalogue-shaped', () => {
    visit('/demo?agent=../../etc/passwd&tier=L9')
    render(<Demo />)

    expect(screen.queryByText(/You are requesting/i)).not.toBeInTheDocument()
  })

  it('says nothing about an agent when the visitor came directly', () => {
    visit('/demo')
    render(<Demo />)

    expect(screen.queryByText(/You are requesting/i)).not.toBeInTheDocument()
  })
})

describe('Demo privacy notice', () => {
  it('tells the visitor who is collecting and links the policy, at the point of collection', () => {
    render(<Demo />)

    const link = screen.getByRole('link', { name: /privacy policy/i })
    expect(link).toHaveAttribute('href', '/privacy')
    expect(screen.getByText(/Colleague AI s\.r\.o\., Praha/)).toBeInTheDocument()
    expect(screen.getByText(/only to arrange your demo/i)).toBeInTheDocument()
  })

  it('links the localised policy, not the English one', () => {
    visit('/de/demo')
    render(<Demo />)

    expect(screen.getByRole('link', { name: /Datenschutzerkl/i })).toHaveAttribute('href', '/de/datenschutz')
  })
})

describe('Demo localisation', () => {
  it('renders German copy and sets the document language on /de/demo', async () => {
    visit('/de/demo')
    render(<Demo />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Demo buchen')
    expect(screen.getByRole('button', { name: /demo anfordern/i })).toBeInTheDocument()
    // Exact text, not /unternehmen/i: in German "Unternehmen" is both the
    // Company field and the Corporate pillar, so a loose match hits two nodes.
    expect(screen.getByLabelText('Unternehmen *')).toBe(document.getElementById('company'))

    await waitFor(() => expect(document.documentElement.lang).toBe('de'))
    expect(document.documentElement).toHaveAttribute('data-cai-page', 'demo')
    expect(document.title).toMatch(/Demo buchen/)
  })

  it('translates the areas of interest, not only the labels around them', () => {
    visit('/pl/demo')
    render(<Demo />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Zarezerwuj demo')
    expect(screen.getByLabelText(/ryzyko, bezpieczeństwo i zgodność/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/dane i infrastruktura/i)).toBeInTheDocument()
  })

  it('renders French copy on /fr/demo', () => {
    visit('/fr/demo')
    render(<Demo />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Réserver une démo')
    expect(screen.getByRole('button', { name: /demander une démo/i })).toBeInTheDocument()
  })

  it('falls back to English for a locale the site does not serve', async () => {
    visit('/xx/demo')
    render(<Demo />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Book Your Demo')
    await waitFor(() => expect(document.documentElement.lang).toBe('en'))
  })

  it('localises the canonical link so the eight demo URLs do not compete', async () => {
    visit('/it/demo')
    render(<Demo />)

    await waitFor(() => {
      const canonical = document.querySelector('link[rel="canonical"]')
      expect(canonical).toHaveAttribute('href', 'https://www.colleagueai.ai/it/demo')
    })
  })
})
