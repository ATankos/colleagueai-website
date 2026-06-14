import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import ColleagueAIMarketplace from './ColleagueAIMarketplace'

describe('ColleagueAIMarketplace', () => {
  it('renders without crashing', () => {
    render(<ColleagueAIMarketplace />)

    expect(document.body).toBeInTheDocument()
  })

  it('renders marketplace content', () => {
    render(<ColleagueAIMarketplace />)

    expect(
      screen.getAllByText(/Marketplace|AI agents|Colleague AI/i).length
    ).toBeGreaterThan(0)
  })
})
