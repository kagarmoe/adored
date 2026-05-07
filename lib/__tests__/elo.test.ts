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

  it('stronger winner gains less than weaker winner', () => {
    const strongWin = updateElo(1200, 1000)
    const weakWin = updateElo(800, 1000)
    expect(weakWin.winnerNew - 800).toBeGreaterThan(strongWin.winnerNew - 1200)
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
    const favorites = tiered.filter(i => i.tier === 'favorites')
    expect(favorites.length).toBe(2) // 25% of 8
  })

  it('assigns 25–35% to strongKeeps', () => {
    const tiered = computeTiers(items)
    const strong = tiered.filter(i => i.tier === 'strongKeeps')
    expect(strong.length).toBeGreaterThanOrEqual(1)
  })

  it('assigns below 45% to belowTheLine', () => {
    const tiered = computeTiers(items)
    const below = tiered.filter(i => i.tier === 'belowTheLine')
    expect(below.length).toBeGreaterThan(0)
  })

  it('returns items sorted by elo descending', () => {
    const tiered = computeTiers(items)
    for (let i = 1; i < tiered.length; i++) {
      expect(tiered[i - 1].eloRating).toBeGreaterThanOrEqual(tiered[i].eloRating)
    }
  })
})
