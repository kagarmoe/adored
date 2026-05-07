import { describe, it, expect } from 'vitest'
import { selectNextPair } from '@/lib/pairing'

const makeItems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    eloRating: 1000 + i * 10,
  }))

const makeComparison = (aId: number, bId: number) => ({
  itemAId: aId,
  itemBId: bId,
  winnerId: aId,
})

describe('selectNextPair', () => {
  it('returns null when fewer than 2 items', () => {
    expect(selectNextPair([], [])).toBeNull()
    expect(selectNextPair([makeItems(1)[0]], [])).toBeNull()
  })

  it('returns a pair of different items', () => {
    const pair = selectNextPair(makeItems(5), [])
    expect(pair).not.toBeNull()
    expect(pair!.itemA.id).not.toBe(pair!.itemB.id)
  })

  it('prefers items with fewer comparisons', () => {
    const items = makeItems(5)
    const comparisons = Array.from({ length: 10 }, () => makeComparison(1, 2))
    const pair = selectNextPair(items, comparisons)
    const ids = new Set([pair!.itemA.id, pair!.itemB.id])
    expect(ids.has(1) && ids.has(2)).toBe(false)
  })

  it('returns items with close elo ratings when possible', () => {
    const items = [
      { id: 1, eloRating: 1000 },
      { id: 2, eloRating: 1001 },
      { id: 3, eloRating: 1500 },
    ]
    const pair = selectNextPair(items, [])
    const ids = new Set([pair!.itemA.id, pair!.itemB.id])
    expect(ids.has(1) && ids.has(2)).toBe(true)
  })
})
