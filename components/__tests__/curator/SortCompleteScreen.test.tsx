import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SortCompleteScreen } from '@/components/curator/SortCompleteScreen'
import type { TieredItem } from '@/lib/elo'

const tiered: TieredItem[] = [
  { id: 1, eloRating: 1200, tier: 'favorites' },
  { id: 2, eloRating: 1150, tier: 'favorites' },
  { id: 3, eloRating: 1100, tier: 'strongKeeps' },
  { id: 4, eloRating: 1050, tier: 'maybeKeeps' },
  { id: 5, eloRating: 950, tier: 'belowTheLine' },
  { id: 6, eloRating: 900, tier: 'belowTheLine' },
]

describe('SortCompleteScreen', () => {
  it('shows the celebratory headline', () => {
    render(<SortCompleteScreen tiered={tiered} comparisonCount={42} onContinue={() => {}} />)
    expect(screen.getByText(/congratulations/i)).toBeInTheDocument()
    expect(screen.getByText(/your collection is sorted/i)).toBeInTheDocument()
  })

  it('does not use failure or time-out framing', () => {
    render(<SortCompleteScreen tiered={tiered} comparisonCount={42} onContinue={() => {}} />)
    expect(screen.queryByText(/incomplete/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/time ran out/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument()
  })

  it('shows the comparison count', () => {
    render(<SortCompleteScreen tiered={tiered} comparisonCount={42} onContinue={() => {}} />)
    expect(screen.getByText(/42 comparisons used/i)).toBeInTheDocument()
  })

  it('singularizes comparison when count is 1', () => {
    render(<SortCompleteScreen tiered={tiered} comparisonCount={1} onContinue={() => {}} />)
    expect(screen.getByText(/1 comparison used/i)).toBeInTheDocument()
  })

  it('renders a tier breakdown with all four tiers', () => {
    render(<SortCompleteScreen tiered={tiered} comparisonCount={42} onContinue={() => {}} />)
    expect(screen.getAllByText(/top picks/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/strong keeps/i)).toBeInTheDocument()
    expect(screen.getByText(/maybe keeps/i)).toBeInTheDocument()
    expect(screen.getByText(/below the line/i)).toBeInTheDocument()
  })

  it('invokes onContinue when the action button is clicked', () => {
    const onContinue = vi.fn()
    render(<SortCompleteScreen tiered={tiered} comparisonCount={42} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: /see results/i }))
    expect(onContinue).toHaveBeenCalledOnce()
  })
})
