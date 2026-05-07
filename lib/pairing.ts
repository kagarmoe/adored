interface Item {
  id: number
  eloRating: number
}

interface Comparison {
  itemAId: number
  itemBId: number
  winnerId: number
}

interface Pair {
  itemA: Item
  itemB: Item
}

export function selectNextPair(
  items: Item[],
  comparisons: Comparison[]
): Pair | null {
  if (items.length < 2) return null

  const compCount = new Map<number, number>()
  for (const item of items) compCount.set(item.id, 0)
  for (const c of comparisons) {
    compCount.set(c.itemAId, (compCount.get(c.itemAId) ?? 0) + 1)
    compCount.set(c.itemBId, (compCount.get(c.itemBId) ?? 0) + 1)
  }

  const compared = new Set<string>()
  for (const c of comparisons) {
    const key = [c.itemAId, c.itemBId].sort().join('-')
    compared.add(key)
  }

  let bestPair: Pair | null = null
  let bestScore = Infinity

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]
      const b = items[j]
      const key = [a.id, b.id].sort().join('-')

      const alreadyCompared = compared.has(key) ? 1000 : 0
      const totalComps = (compCount.get(a.id) ?? 0) + (compCount.get(b.id) ?? 0)
      const eloDiff = Math.abs(a.eloRating - b.eloRating)

      const score = alreadyCompared + totalComps * 10 + eloDiff * 0.1

      if (score < bestScore) {
        bestScore = score
        bestPair = { itemA: a, itemB: b }
      }
    }
  }

  return bestPair
}
