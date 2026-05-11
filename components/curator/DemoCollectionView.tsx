'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { computeTiers, updateElo } from '@/lib/elo'
import type { Tier } from '@/lib/elo'
import { TierSection } from '@/components/curator/TierSection'
import {
  clearDemoComparisons,
  loadDemoComparisons,
  type DemoComparison,
} from '@/lib/demo-store'

interface DemoItem {
  id: number
  brand: string
  style: string
  heroUrl: string | null
}

interface Props {
  collectionId: number
  collectionName: string
  items: DemoItem[]
}

const TIERS: Tier[] = ['favorites', 'strongKeeps', 'maybeKeeps', 'belowTheLine']

export function DemoCollectionView({ collectionId, collectionName, items }: Props) {
  const [comparisons, setComparisons] = useState<DemoComparison[]>([])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setComparisons(loadDemoComparisons(collectionId))
  }, [collectionId])

  const tieredItems = useMemo(() => {
    const ratings = new Map<number, number>(items.map(i => [i.id, 1000]))
    for (const c of comparisons) {
      const winner = c.winnerId
      const loser = winner === c.itemAId ? c.itemBId : c.itemAId
      const wr = ratings.get(winner)
      const lr = ratings.get(loser)
      if (wr === undefined || lr === undefined) continue
      const { winnerNew, loserNew } = updateElo(wr, lr)
      ratings.set(winner, winnerNew)
      ratings.set(loser, loserNew)
    }
    return computeTiers(items.map(i => ({ id: i.id, eloRating: ratings.get(i.id) ?? 1000 }))).map(
      tiered => {
        const item = items.find(i => i.id === tiered.id)!
        return { ...tiered, brand: item.brand, style: item.style, heroUrl: item.heroUrl }
      },
    )
  }, [items, comparisons])

  const grouped = useMemo(
    () =>
      Object.fromEntries(
        TIERS.map(t => [t, tieredItems.filter(i => i.tier === t)]),
      ) as Record<Tier, typeof tieredItems>,
    [tieredItems],
  )

  function reset() {
    if (!confirm('Clear your demo rankings and start over?')) return
    clearDemoComparisons(collectionId)
    setComparisons([])
  }

  return (
    <>
      <div className="flex items-baseline justify-between mb-10 gap-4 flex-wrap">
        <h1 className="font-display text-heading text-text-primary">{collectionName}</h1>
        <div className="flex items-center gap-6">
          <button
            onClick={reset}
            className="font-display text-label uppercase tracking-widest text-text-muted hover:text-text-primary"
          >
            Reset demo
          </button>
          <Link
            href={`/${collectionId}/rank`}
            className="font-display text-label uppercase tracking-widest bg-accent text-white rounded-full px-4 py-1.5 no-underline hover:opacity-75 transition-opacity"
          >
            Sort →
          </Link>
        </div>
      </div>

      {items.length < 2 ? (
        <p className="font-body text-text-muted">Not enough items to rank yet.</p>
      ) : (
        TIERS.map(tier => (
          <TierSection key={tier} tier={tier} items={grouped[tier] ?? []} />
        ))
      )}
    </>
  )
}
