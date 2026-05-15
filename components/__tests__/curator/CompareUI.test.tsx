import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetNextPair = vi.hoisted(() => vi.fn())
const mockSubmitComparison = vi.hoisted(() => vi.fn())
const mockMarkRankingCompleted = vi.hoisted(() => vi.fn())
const mockUseSearchParams = vi.hoisted(() => vi.fn())
const mockSessionEndScreen = vi.hoisted(() =>
  vi.fn((_props: Record<string, unknown>) => null),
)
const mockComparisonTimer = vi.hoisted(() =>
  vi.fn((_props: { onExpire: () => void }) => null),
)

vi.mock('@/actions/ranking', () => ({
  getNextPair: (id: number) => mockGetNextPair(id),
  submitComparison: (...args: unknown[]) => mockSubmitComparison(...args),
  markRankingCompleted: (...args: unknown[]) => mockMarkRankingCompleted(...args),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockUseSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/curator/SessionEndScreen', () => ({
  SessionEndScreen: (props: Record<string, unknown>) => mockSessionEndScreen(props),
}))

vi.mock('@/components/curator/ComparisonTimer', () => ({
  ComparisonTimer: (props: { onExpire: () => void }) => mockComparisonTimer(props),
}))

import { CompareUI } from '@/components/curator/CompareUI'

const PAIR = {
  itemA: { id: 1, eloRating: 1000, brand: 'Mochi', style: 'Tabby', heroUrl: null },
  itemB: { id: 2, eloRating: 1000, brand: 'Pepper', style: 'Black cat', heroUrl: null },
}

const RANKING_STATE = {
  pair: PAIR,
  items: [
    { id: 1, eloRating: 1000 },
    { id: 2, eloRating: 1000 },
  ],
  comparisonCount: 0,
}

describe('CompareUI (non-demo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSearchParams.mockReturnValue(new URLSearchParams('duration=300'))
    mockGetNextPair.mockResolvedValue(RANKING_STATE)
    mockSubmitComparison.mockResolvedValue(undefined)
    mockMarkRankingCompleted.mockResolvedValue(undefined)
  })

  it('passes a per-session comparison count (NOT the cumulative total) to SessionEndScreen', async () => {
    // Returning curator: server reports 50 lifetime comparisons in DB.
    // The fresh session has done 0 picks before the timer expires — the
    // estimate must extrapolate from per-session pace, not the lifetime total.
    let capturedExpire: (() => void) | null = null
    mockComparisonTimer.mockImplementation((props: { onExpire: () => void }) => {
      capturedExpire = props.onExpire
      return null
    })
    mockGetNextPair.mockResolvedValue({
      ...RANKING_STATE,
      comparisonCount: 50,
    })

    await act(async () => {
      render(<CompareUI collectionId={10} />)
    })

    // First successful pick.
    await act(async () => {
      fireEvent.click(screen.getByText('Mochi'))
    })

    // Trigger session end.
    await act(async () => {
      capturedExpire?.()
    })

    expect(mockSessionEndScreen).toHaveBeenCalled()
    const calls = mockSessionEndScreen.mock.calls
    const lastCall = calls[calls.length - 1][0] as unknown as {
      comparisonCount: number
      comparisonsThisSession: number
    }
    // Lifetime total preserved for display.
    expect(lastCall.comparisonCount).toBe(50)
    // But per-session counter starts at 0 and reflects only this session's
    // single pick — not the 50 lifetime rounds.
    expect(lastCall.comparisonsThisSession).toBe(1)
  })

  it('submits only one comparison when the same card is clicked twice in rapid succession', async () => {
    let resolveSubmit: (() => void) | null = null
    mockSubmitComparison.mockImplementation(
      () => new Promise<void>((resolve) => { resolveSubmit = () => resolve() }),
    )

    await act(async () => {
      render(<CompareUI collectionId={10} />)
    })

    // First card renders by item brand text.
    const firstCard = await screen.findByText('Mochi')

    // Two rapid clicks before the in-flight submitComparison resolves.
    await act(async () => {
      fireEvent.click(firstCard)
      fireEvent.click(firstCard)
    })

    expect(mockSubmitComparison).toHaveBeenCalledTimes(1)

    // Resolve and let pick() finish so the test cleans up.
    await act(async () => {
      resolveSubmit?.()
      await Promise.resolve()
    })
  })
})

describe('CompareUI (demo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSearchParams.mockReturnValue(new URLSearchParams('duration=300'))
    window.localStorage.clear()
  })

  it('shows a friendly message when the demo collection has fewer than 2 items', async () => {
    await act(async () => {
      render(
        <CompareUI
          collectionId={5}
          demoItems={[{ id: 1, brand: 'Solo', style: '', heroUrl: null }]}
        />,
      )
    })
    expect(await screen.findByText(/not enough items to rank/i)).toBeInTheDocument()
  })
})
