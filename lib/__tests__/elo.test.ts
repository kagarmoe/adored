import { describe, it, expect } from 'vitest'
import { expectedScore, updateElo, computeTiers } from '@/lib/elo'

describe('expectedScore', () => {
  it('returns 0.5 when ratings are equal', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5)
  })

  it('returns > 0.5 for higher-rated player', () => {
    expect(expectedScore(1200, 1000)).toBeGreaterThan(0.5)
  })

  it('returns < 0.5 for lower-rated player', () => {
    expect(expectedScore(800, 1000)).toBeLessThan(0.5)
  })

  it('returns value between 0 and 1', () => {
    expect(expectedScore(2000, 100)).toBeGreaterThan(0)
    expect(expectedScore(2000, 100)).toBeLessThan(1)
    expect(expectedScore(100, 2000)).toBeGreaterThan(0)
    expect(expectedScore(100, 2000)).toBeLessThan(1)
  })

  it('is symmetric: p(A>B) + p(B>A) = 1', () => {
    expect(expectedScore(1300, 900) + expectedScore(900, 1300)).toBeCloseTo(1)
  })

  it('400-point gap yields ~0.909 expected score', () => {
    // Formula: 1/(1+10^(400/400)) = 1/(1+10) = ~0.0909 for lower-rated
    expect(expectedScore(1400, 1000)).toBeCloseTo(0.909, 2)
  })
})

describe('updateElo', () => {
  it('increases winner rating and decreases loser rating', () => {
    const { winnerNew, loserNew } = updateElo(1000, 1000)
    expect(winnerNew).toBeGreaterThan(1000)
    expect(loserNew).toBeLessThan(1000)
  })

  it('changes are symmetric — zero-sum', () => {
    const { winnerNew, loserNew } = updateElo(1000, 1000)
    expect(winnerNew + loserNew).toBeCloseTo(2000)
  })

  it('zero-sum holds for unequal ratings', () => {
    const before = 1200 + 900
    const { winnerNew, loserNew } = updateElo(1200, 900)
    expect(winnerNew + loserNew).toBeCloseTo(before)
  })

  it('stronger winner gains less than weaker winner', () => {
    const strongWin = updateElo(1200, 1000)
    const weakWin = updateElo(800, 1000)
    expect(weakWin.winnerNew - 800).toBeGreaterThan(strongWin.winnerNew - 1200)
  })

  it('delta is K * (1 - expectedScore) = 16 for equal ratings', () => {
    // K=32, expected=0.5, delta = 32 * 0.5 = 16
    const { winnerNew } = updateElo(1000, 1000)
    expect(winnerNew).toBeCloseTo(1016, 1)
  })

  it('upset: weaker winner gains close to K', () => {
    // Very large gap — weaker player should gain close to K=32
    const { winnerNew } = updateElo(500, 2000)
    expect(winnerNew - 500).toBeCloseTo(32, 0)
  })

  it('winner never decreases', () => {
    for (const [w, l] of [[500, 2000], [1000, 1000], [2000, 500]]) {
      expect(updateElo(w, l).winnerNew).toBeGreaterThan(w)
    }
  })

  it('loser never increases', () => {
    for (const [w, l] of [[500, 2000], [1000, 1000], [2000, 500]]) {
      expect(updateElo(w, l).loserNew).toBeLessThan(l)
    }
  })
})

describe('computeTiers', () => {
  const items = [
    { id: 1, eloRating: 1200 },
    { id: 2, eloRating: 1150 },
    { id: 3, eloRating: 1100 },
    { id: 4, eloRating: 1050 },
    { id: 5, eloRating: 1000 },
    { id: 6, eloRating: 950 },
    { id: 7, eloRating: 900 },
    { id: 8, eloRating: 850 },
  ]

  it('assigns top 25% to favorites', () => {
    const tiered = computeTiers(items)
    expect(tiered.filter(i => i.tier === 'favorites')).toHaveLength(2)
  })

  it('assigns 25–35% to strongKeeps', () => {
    const tiered = computeTiers(items)
    expect(tiered.filter(i => i.tier === 'strongKeeps').length).toBeGreaterThanOrEqual(1)
  })

  it('assigns below 45% to belowTheLine', () => {
    const tiered = computeTiers(items)
    expect(tiered.filter(i => i.tier === 'belowTheLine').length).toBeGreaterThan(0)
  })

  it('returns items sorted by elo descending', () => {
    const tiered = computeTiers(items)
    for (let i = 1; i < tiered.length; i++) {
      expect(tiered[i - 1].eloRating).toBeGreaterThanOrEqual(tiered[i].eloRating)
    }
  })

  it('single item is assigned a tier', () => {
    const tiered = computeTiers([{ id: 1, eloRating: 1000 }])
    expect(tiered).toHaveLength(1)
    expect(tiered[0].tier).toBe('favorites')
  })

  it('empty list returns empty', () => {
    expect(computeTiers([])).toHaveLength(0)
  })

  it('preserves item id and eloRating', () => {
    const tiered = computeTiers([{ id: 99, eloRating: 1234 }])
    expect(tiered[0]).toMatchObject({ id: 99, eloRating: 1234 })
  })

  it('all tiers appear with enough items', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i, eloRating: 1000 - i * 10 }))
    const tiered = computeTiers(many)
    const tiers = new Set(tiered.map(i => i.tier))
    expect(tiers.has('favorites')).toBe(true)
    expect(tiers.has('strongKeeps')).toBe(true)
    expect(tiers.has('maybeKeeps')).toBe(true)
    expect(tiers.has('belowTheLine')).toBe(true)
  })

  it('does not mutate the input array', () => {
    const input = [{ id: 1, eloRating: 900 }, { id: 2, eloRating: 1100 }]
    const original = [...input]
    computeTiers(input)
    expect(input).toEqual(original)
  })
})
