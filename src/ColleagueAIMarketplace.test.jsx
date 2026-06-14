import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ColleagueAIMarketplace from './ColleagueAIMarketplace.jsx'

// Helper: open the language dropdown and click a locale option by code (e.g. 'CS', 'EN').
// The dropdown uses role="listbox" / role="option" so we open the pill button first.
async function switchLang(user, code) {
  // The pill button shows current flag + code. Click it to open the dropdown.
  const pill = screen.getByRole('button', { name: /[A-Z]{2}/ })
  await user.click(pill)
  // Options are inside the listbox; each shows "<flag> <CODE> <name>".
  const option = screen.getByRole('option', { name: new RegExp('\\b' + code + '\\b', 'i') })
  await user.click(option)
}

describe('ColleagueAIMarketplace', () => {
  it('renders without crashing and shows the English hero by default', () => {
    render(<ColleagueAIMarketplace />)
    // English hero copy contains "actually" — italicized fragment
    expect(screen.getByText(/actually/i)).toBeInTheDocument()
  })

  it('switches all copy to Czech when CS option is selected', async () => {
    const user = userEvent.setup()
    render(<ColleagueAIMarketplace />)

    // English nav link "Philosophy" visible initially
    expect(screen.getAllByText('Philosophy').length).toBeGreaterThan(0)

    await switchLang(user, 'CS')

    // Czech nav uses "Filozofie" instead — should now appear
    expect(screen.getAllByText('Filozofie').length).toBeGreaterThan(0)
    // English "Philosophy" should no longer appear
    expect(screen.queryByText('Philosophy')).not.toBeInTheDocument()
  })

  it('toggles back to English when EN is selected after CS', async () => {
    const user = userEvent.setup()
    render(<ColleagueAIMarketplace />)

    await switchLang(user, 'CS')
    await switchLang(user, 'EN')

    expect(screen.getAllByText('Philosophy').length).toBeGreaterThan(0)
    expect(screen.queryByText('Filozofie')).not.toBeInTheDocument()
  })

  it('filters the agent grid when a category pill is clicked', async () => {
    const user = userEvent.setup()
    render(<ColleagueAIMarketplace />)

    // Before filtering: "Month-End Close" (finance) AND "KYC Workflow" (legal) both visible
    expect(screen.getByText('Month-End Close')).toBeInTheDocument()
    expect(screen.getByText('KYC Workflow')).toBeInTheDocument()

    // Click "Finance" filter pill
    await user.click(screen.getByRole('button', { name: 'Finance' }))

    // Finance agents still visible
    expect(screen.getByText('Month-End Close')).toBeInTheDocument()
    // Legal agent gone
    expect(screen.queryByText('KYC Workflow')).not.toBeInTheDocument()
  })

  it('restores all agents when "All Agents" filter is