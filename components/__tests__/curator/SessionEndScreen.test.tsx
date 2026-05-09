import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SessionEndScreen } from '@/components/curator/SessionEndScreen'
import type { TieredItem } from '@/lib/elo'

const tiered: TieredItem[] = [
  { id: 1, eloRating: 1200, tier: 'favorites' },
  { id: 2, eloRating: 1150, tier: 'favorites' },
  { id: 3, eloRating: 1100, tier: 'strongKeeps' },
  { id: 4, eloRating: 1050, tier: 'maybeKeeps' },
  { id: 5, eloRating: 950, tier: 'belowTheLine' },
]

describe('SessionEndScreen', () => {
  it('uses affirming "good job" copy, never "time ran out" or "incomplete"', () => {
    render(
      <SessionEndScreen tiered={tiered} comparisonCount={5} onContinue={() => {}} />,
    )
    expect(screen.getByText(/good job/i)).toBeInTheDocument()
    expect(screen.queryByText(/time ran out/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/incomplete/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument()
  })

  it('shows the count of items ranked', () => {
    render(
      <SessionEndScreen tiered={tiered} comparisonCount={5} onContinue={() => {}} />,
    )
    expect(screen.getByText(/ranked 5 items/i)).toBeInTheDocument()
  })

  it('shows comparison count', () => {
    render(
      <SessionEndScreen tiered={tiered} comparisonCount={7} onContinue={() => {}} />,
    )
    expect(screen.getByText(/7 comparisons so far/i)).toBeInTheDocument()
  })

  it('renders a tier breakdown for partial results', () => {
    render(
      <SessionEndScreen tiered={tiered} comparisonCount={5} onContinue={() => {}} />,
    )
    expect(screen.getByText(/top picks/i)).toBeInTheDocument()
    expect(screen.getByText(/strong keeps/i)).toBeInTheDocument()
    expect(screen.getByText(/maybe keeps/i)).toBeInTheDocument()
    expect(screen.getByText(/below the line/i)).toBeInTheDocument()
  })

  it('shows progress note when close to natural completion', () => {
    render(
      <SessionEndScreen
        tiered={tiered}
        comparisonCount={5}
        closeToCompletion
        onContinue={() => {}}
      />,
    )
    expect(screen.getByText(/coming into focus/i)).toBeInTheDocument()
  })

  it('shows a friendly default note when not close to completion', () => {
    render(
      <SessionEndScreen tiered={tiered} comparisonCount={5} onContinue={() => {}} />,
    )
    expect(screen.getByText(/come back anytime/i)).toBeInTheDocument()
  })

  it('invokes onContinue when the action button is clicked', () => {
    const onContinue = vi.fn()
    render(
      <SessionEndScreen tiered={tiered} comparisonCount={5} onContinue={onContinue} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /see results/i }))
    expect(onContinue).toHaveBeenCalledOnce()
  })
})
