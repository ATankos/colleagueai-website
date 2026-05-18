import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ColleagueAIMarketplace from './ColleagueAIMarketplace.jsx'

describe('ColleagueAIMarketplace', () => {
  it('renders without crashing and shows the English hero by default', () => {
    render(<ColleagueAIMarketplace />)
    // English hero copy contains "actually" — italicized fragment
    expect(screen.getByText(/actually/i)).toBeInTheDocument()
  })

  it('switches all copy to Czech when CS toggle is clicked', async () => {
    const user = userEvent.setup()
    render(<ColleagueAIMarketplace />)

    // English nav link "Philosophy" visible initially
    expect(screen.getAllByText('Philosophy').length).toBeGreaterThan(0)

    // Click the CS button
    await user.click(screen.getByRole('button', { name: 'CS' }))

    // Czech nav uses "Filozofie" instead — should now appear
    expect(screen.getAllByText('Filozofie').length).toBeGreaterThan(0)
    // English "Philosophy" should no longer appear
    expect(screen.queryByText('Philosophy')).not.toBeInTheDocument()
  })

  it('toggles back to English when EN is clicked after CS', async () => {
    const user = userEvent.setup()
    render(<ColleagueAIMarketplace />)

    await user.click(screen.getByRole('button', { name: 'CS' }))
    await user.click(screen.getByRole('button', { name: 'EN' }))

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

  it('restores all agents when "All Agents" filter is re-selected', async () => {
    const user = userEvent.setup()
    render(<ColleagueAIMarketplace />)

    await user.click(screen.getByRole('button', { name: 'Finance' }))
    expect(screen.queryByText('KYC Workflow')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'All Agents' }))
    expect(screen.getByText('KYC Workflow')).toBeInTheDocument()
  })
})
