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
    it('does NOT render the tier breakdown (no "Top picks/Strong keeps/Below the line")', () => {
      render(
        <SessionEndScreen
          tiered={tiered}
          comparisonCount={5}
          confidence="low"
          onContinue={() => {}}
        />,
      )
      expect(screen.queryByText(/top picks/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/strong keeps/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/below the line/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/where things stand/i)).not.toBeInTheDocument()
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

    it('suggests another session of the same length (NOT a longer one — timer max is 5 min)', () => {
      render(
        <SessionEndScreen
          tiered={tiered}
          comparisonCount={5}
          confidence="low"
          onContinue={() => {}}
        />,
      )
      expect(screen.getByText(/another session of the same length/i)).toBeInTheDocument()
      expect(screen.queryByText(/longer session/i)).not.toBeInTheDocument()
    })

    it('shows per-tier session-count estimates (favorites / likely keeps / maybe keeps)', () => {
      render(
        <SessionEndScreen
          tiered={tiered}
          comparisonCount={5}
          confidence="low"
          itemCount={20}
          onContinue={() => {}}
        />,
      )
      const estimates = screen.getByTestId('session-estimates')
      expect(estimates).toBeInTheDocument()
      expect(estimates).toHaveTextContent(/favorites/i)
      expect(estimates).toHaveTextContent(/likely keeps/i)
      expect(estimates).toHaveTextContent(/maybe keeps/i)
      // Each row should mention a session count.
      expect(estimates.textContent).toMatch(/session/i)
    })

    it('estimates require more sessions for broader tiers (favorites <= likely keeps <= maybe keeps)', () => {
      render(
        <SessionEndScreen
          tiered={tiered}
          comparisonCount={5}
          confidence="low"
          itemCount={20}
          onContinue={() => {}}
        />,
      )
      const rows = screen.getByTestId('session-estimates').querySelectorAll('li')
      expect(rows).toHaveLength(3)
      const numFor = (row: Element): number => {
        const m = row.textContent?.match(/~(\d+)/)
        return m ? parseInt(m[1], 10) : 0
      }
      const fav = numFor(rows[0])
      const likely = numFor(rows[1])
      const maybe = numFor(rows[2])
      expect(fav).toBeLessThanOrEqual(likely)
      expect(likely).toBeLessThanOrEqual(maybe)
    })
  })
})
