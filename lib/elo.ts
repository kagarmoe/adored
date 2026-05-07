const K = 32

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}

export function updateElo(
  winnerRating: number,
  loserRating: number
): { winnerNew: number; loserNew: number } {
  const expected = expectedScore(winnerRating, loserRating)
  const delta = K * (1 - expected)
  return {
    winnerNew: winnerRating + delta,
    loserNew: loserRating - delta,
  }
}

export type Tier = 'favorites' | 'strongKeeps' | 'maybeKeeps' | 'belowTheLine'

export interface TieredItem {
  id: number
  eloRating: number
  tier: Tier
}

export function computeTiers(
  items: { id: number; eloRating: number }[]
): TieredItem[] {
  const sorted = [...items].sort((a, b) => b.eloRating - a.eloRating)
  const n = sorted.length

  return sorted.map((item, index) => {
    const percentile = index / n
    let tier: Tier
    if (percentile < 0.25) tier = 'favorites'
    else if (percentile < 0.35) tier = 'strongKeeps'
    else if (percentile < 0.45) tier = 'maybeKeeps'
    else tier = 'belowTheLine'
    return { ...item, tier }
  })
}
