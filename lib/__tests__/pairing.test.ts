import { describe, it, expect } from 'vitest'
import { selectNextPair } from '@/lib/pairing'

const makeItems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, eloRating: 1000 + i * 10 }))

const makeComp = (aId: number, bId: number) => ({ itemAId: aId, itemBId: bId, winnerId: aId })

describe('selectNextPair', () => {
  it('returns null for empty items', () => {
    expect(selectNextPair([], [])).toBeNull()
  })

  it('returns null for single item', () => {
    expect(selectNextPair([{ id: 1, eloRating: 1000 }], [])).toBeNull()
  })

  it('returns a pair of different items', () => {
    const pair = selectNextPair(makeItems(5), [])
    expect(pair).not.toBeNull()
    expect(pair!.itemA.id).not.toBe(pair!.itemB.id)
  })

  it('returns valid items from the input list', () => {
    const items = makeItems(4)
    const pair = selectNextPair(items, [])
    const ids = items.map(i => i.id)
    expect(ids).toContain(pair!.itemA.id)
    expect(ids).toContain(pair!.itemB.id)
  })

  it('prefers items with fewer comparisons', () => {
    const items = makeItems(5)
    const comparisons = Array.from({ length: 10 }, () => makeComp(1, 2))
    const pair = selectNextPair(items, comparisons)
    const ids = new Set([pair!.itemA.id, pair!.itemB.id])
    expect(ids.has(1) && ids.has(2)).toBe(false)
  })

  it('returns close elo ratings when possible', () => {
    const items = [
      { id: 1, eloRating: 1000 },
      { id: 2, eloRating: 1001 },
      { id: 3, eloRating: 1500 },
    ]
    const pair = selectNextPair(items, [])
    const ids = new Set([pair!.itemA.id, pair!.itemB.id])
    expect(ids.has(1) && ids.has(2)).toBe(true)
  })

  it('works with exactly 2 items', () => {
    const items = [{ id: 1, eloRating: 1000 }, { id: 2, eloRating: 1100 }]
    const pair = selectNextPair(items, [])
    expect(pair).not.toBeNull()
    expect(new Set([pair!.itemA.id, pair!.itemB.id]).size).toBe(2)
  })

  it('deprioritizes already-compared pairs', () => {
    const items = makeItems(3) // ids 1,2,3
    const comparisons = [makeComp(1, 2)]
    const pair = selectNextPair(items, comparisons)
    // Should prefer a pair that hasn't been compared yet
    const ids = new Set([pair!.itemA.id, pair!.itemB.id])
    const alreadyDone = ids.has(1) && ids.has(2)
    expect(alreadyDone).toBe(false)
  })

  it('still returns a pair when all pairs have been compared', () => {
    const items = [{ id: 1, eloRating: 1000 }, { id: 2, eloRating: 1000 }]
    const comparisons = [makeComp(1, 2)]
    const pair = selectNextPair(items, comparisons)
    expect(pair).not.toBeNull()
  })

  it('pair scoring favors low comparison count over close elo', () => {
    // items 1&2 are close in elo but both have many comparisons
    // items 1&3 are further apart but have no comparisons — should prefer this
    const items = [
      { id: 1, eloRating: 1000 },
      { id: 2, eloRating: 1001 },
      { id: 3, eloRating: 1100 },
    ]
    const manyComps = Array.from({ length: 5 }, () => makeComp(1, 2))
    const pair = selectNextPair(items, manyComps)
    // 1&2 have high totalComps penalty → 1&3 or 2&3 preferred
    const ids = new Set([pair!.itemA.id, pair!.itemB.id])
    expect(ids.has(1) && ids.has(2)).toBe(false)
  })
})

describe('selectNextPair tier bias', () => {
  it('prefers a favorites/favorites pair over a belowTheLine/belowTheLine pair when other factors are equal', () => {
    const items = [
      { id: 1, eloRating: 1000, tier: 'favorites' as const },
      { id: 2, eloRating: 1000, tier: 'favorites' as const },
      { id: 3, eloRating: 1000, tier: 'belowTheLine' as const },
      { id: 4, eloRating: 1000, tier: 'belowTheLine' as const },
    ]
    const pair = selectNextPair(items, [])
    const ids = new Set([pair!.itemA.id, pair!.itemB.id])
    expect(ids.has(1) && ids.has(2)).toBe(true)
  })

  it('prefers a boundary-straddling favorites/strongKeeps pair over a belowTheLine pair', () => {
    const items = [
      { id: 1, eloRating: 1000, tier: 'favorites' as const },
      { id: 2, eloRating: 1000, tier: 'strongKeeps' as const },
      { id: 3, eloRating: 1000, tier: 'belowTheLine' as const },
      { id: 4, eloRating: 1000, tier: 'belowTheLine' as const },
    ]
    const pair = selectNextPair(items, [])
    const ids = new Set([pair!.itemA.id, pair!.itemB.id])
    expect(ids.has(1) && ids.has(2)).toBe(true)
  })

  it('prefers an aboveLine/belowLine boundary pair over an unrelated belowLine pair', () => {
    const items = [
      { id: 1, eloRating: 1000, tier: 'maybeKeeps' as const },
      { id: 2, eloRating: 1000, tier: 'belowTheLine' as const },
      { id: 3, eloRating: 1000, tier: 'belowTheLine' as const },
      { id: 4, eloRating: 1000, tier: 'belowTheLine' as const },
    ]
    const pair = selectNextPair(items, [])
    const ids = new Set([pair!.itemA.id, pair!.itemB.id])
    expect(ids.has(1) && ids.has(2)).toBe(true)
  })

  it('prefers two-above-line pair over an above/below mix when no boundary straddles', () => {
    const items = [
      { id: 1, eloRating: 1000, tier: 'strongKeeps' as const },
      { id: 2, eloRating: 1000, tier: 'strongKeeps' as const },
      { id: 3, eloRating: 1000, tier: 'belowTheLine' as const },
    ]
    const pair = selectNextPair(items, [])
    const ids = new Set([pair!.itemA.id, pair!.itemB.id])
    expect(ids.has(1) && ids.has(2)).toBe(true)
  })

  it('still avoids already-compared pairs even with strong tier bias', () => {
    // The alreadyCompared penalty (1000) dominates the favorites bonus (-50).
    const items = [
      { id: 1, eloRating: 1000, tier: 'favorites' as const },
      { id: 2, eloRating: 1000, tier: 'favorites' as const },
      { id: 3, eloRating: 1000, tier: 'belowTheLine' as const },
    ]
    const comparisons = [makeComp(1, 2)]
    const pair = selectNextPair(items, comparisons)
    const ids = new Set([pair!.itemA.id, pair!.itemB.id])
    expect(ids.has(1) && ids.has(2)).toBe(false)
  })

  it('falls back to original behavior when tiers are absent', () => {
    // No tier annotations → tierBonus=0 for all pairs → close-elo wins.
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
