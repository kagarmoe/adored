import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetNextPair = vi.hoisted(() => vi.fn())
const mockSubmitComparison = vi.hoisted(() => vi.fn())
const mockUseSearchParams = vi.hoisted(() => vi.fn())

vi.mock('@/actions/ranking', () => ({
  getNextPair: (id: number) => mockGetNextPair(id),
  submitComparison: (...args: unknown[]) => mockSubmitComparison(...args),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockUseSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
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
