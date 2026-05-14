'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { assertCollectionRole } from '@/lib/authz'
import { computeTiers, updateElo } from '@/lib/elo'
import { selectNextPair } from '@/lib/pairing'
import { revalidatePath } from 'next/cache'

export interface PairItem {
  id: number
  eloRating: number
  brand: string
  style: string
  heroUrl: string | null
}

export interface RankingState {
  pair: { itemA: PairItem; itemB: PairItem } | null
  items: { id: number; eloRating: number }[]
  comparisonCount: number
}

export async function getNextPair(collectionId: number): Promise<RankingState> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  // Ranking requires curator-level access (operators manage content but cannot rank).
  await assertCollectionRole(collectionId, session.user.id, 'curator')

  const [items, comparisons] = await Promise.all([
    db.item.findMany({ where: { collectionId } }),
    db.comparison.findMany({ where: { itemA: { collectionId } } }),
  ])

  const tiered = computeTiers(items.map(i => ({ id: i.id, eloRating: i.eloRating })))
  const tierById = new Map(tiered.map(t => [t.id, t.tier]))
  const itemsForPairing = items.map(i => ({
    id: i.id,
    eloRating: i.eloRating,
    tier: tierById.get(i.id),
  }))

  const selected = selectNextPair(itemsForPairing, comparisons)
  const itemById = new Map(items.map(i => [i.id, i]))
  const toPairItem = (id: number): PairItem => {
    const it = itemById.get(id)!
    return {
      id: it.id,
      eloRating: it.eloRating,
      brand: it.brand,
      style: it.style,
      heroUrl: null,
    }
  }

  return {
    pair: selected
      ? { itemA: toPairItem(selected.itemA.id), itemB: toPairItem(selected.itemB.id) }
      : null,
    items: items.map(i => ({ id: i.id, eloRating: i.eloRating })),
    comparisonCount: comparisons.length,
  }
}

export async function submitComparison(
  collectionId: number,
  itemAId: number,
  itemBId: number,
  winnerId: number,
  infoShown: string
) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  // Ranking requires curator-level access (operators manage content but cannot rank).
  await assertCollectionRole(collectionId, session.user.id, 'curator')

  if (winnerId !== itemAId && winnerId !== itemBId) {
    throw new Error('Winner must be one of the two items')
  }

  const loserId = winnerId === itemAId ? itemBId : itemAId

  const [winner, loser] = await Promise.all([
    db.item.findUniqueOrThrow({ where: { id: winnerId } }),
    db.item.findUniqueOrThrow({ where: { id: loserId } }),
  ])

  const { winnerNew, loserNew } = updateElo(winner.eloRating, loser.eloRating)

  await db.$transaction([
    db.comparison.create({
      data: { itemAId, itemBId, winnerId, infoShown },
    }),
    db.item.update({ where: { id: winnerId }, data: { eloRating: winnerNew } }),
    db.item.update({ where: { id: loserId }, data: { eloRating: loserNew } }),
  ])

  revalidatePath(`/${collectionId}`)
}
