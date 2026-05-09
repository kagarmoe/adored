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
  it('uses affirming "good job" copy in either confidence state', () => {
    const { rerender } = render(
      <SessionEndScreen
        tiered={tiered}
        comparisonCount={5}
        confidence="medium"
        onContinue={() => {}}
      />,
    )
    expect(screen.getByText(/good job/i)).toBeInTheDocument()
    expect(screen.queryByText(/time ran out/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/incomplete/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument()

    rerender(
      <SessionEndScreen
        tiered={tiered}
        comparisonCount={5}
        confidence="low"
        onContinue={() => {}}
      />,
    )
    expect(screen.getByText(/good job/i)).toBeInTheDocument()
    expect(screen.queryByText(/time ran out/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/incomplete/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument()
  })

  it('invokes onContinue when the action button is clicked', () => {
    const onContinue = vi.fn()
    render(
      <SessionEndScreen
        tiered={tiered}
        comparisonCount={5}
        confidence="medium"
        onContinue={onContinue}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /see results/i }))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  describe('confidence: medium (provisional stability)', () => {
    it('renders the tier breakdown', () => {
      render(
        <SessionEndScreen
          tiered={tiered}
          comparisonCount={5}
          confidence="medium"
          onContinue={() => {}}
        />,
      )
      expect(screen.getByRole('list')).toBeInTheDocument()
      expect(screen.getByText(/top picks/i)).toBeInTheDocument()
      expect(screen.getByText(/strong keeps/i)).toBeInTheDocument()
      expect(screen.getByText(/maybe keeps/i)).toBeInTheDocument()
      expect(screen.getByText(/below the line/i)).toBeInTheDocument()
    })

    it('shows the count of items ranked', () => {
      render(
        <SessionEndScreen
          tiered={tiered}
          comparisonCount={5}
          confidence="medium"
          onContinue={() => {}}
        />,
      )
      expect(screen.getByText(/ranked 5 items/i)).toBeInTheDocument()
    })

    it('shows comparison count beneath the breakdown', () => {
      render(
        <SessionEndScreen
          tiered={tiered}
          comparisonCount={7}
          confidence="medium"
          onContinue={() => {}}
        />,
      )
      expect(screen.getByText(/7 comparisons so far/i)).toBeInTheDocument()
    })

    it('hedges that the results are provisional', () => {
      render(
        <SessionEndScreen
          tiered={tiered}
          comparisonCount={5}
          confidence="medium"
          onContinue={() => {}}
        />,
      )
      expect(screen.getByText(/lock it in/i)).toBeInTheDocument()
    })
  })

  describe('confidence: low (above-the-line unstable)', () => {
    it('does NOT render the tier breakdown', () => {
      render(
        <SessionEndScreen
          tiered={tiered}
          comparisonCount={5}
          confidence="low"
          onContinue={() => {}}
        />,
      )
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
      expect(screen.queryByText(/top picks/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/strong keeps/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/maybe keeps/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/below the line/i)).not.toBeInTheDocument()
    })

    it('shows the comparison count in the headline', () => {
      render(
        <SessionEndScreen
          tiered={tiered}
          comparisonCount={7}
          confidence="low"
          onContinue={() => {}}
        />,
      )
      expect(screen.getByText(/ranked 7 comparisons/i)).toBeInTheDocument()
    })

    it('encourages a longer session to lock in tiers', () => {
      render(
        <SessionEndScreen
          tiered={tiered}
          comparisonCount={5}
          confidence="low"
          onContinue={() => {}}
        />,
      )
      expect(screen.getByText(/longer session next time/i)).toBeInTheDocument()
    })

    it('does not claim tier-correct results', () => {
      render(
        <SessionEndScreen
          tiered={tiered}
          comparisonCount={5}
          confidence="low"
          onContinue={() => {}}
        />,
      )
      // The breakdown copy ("Where things stand") implies stable tiers; suppressed at low confidence.
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
    })
  })
})
