'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { updateElo } from '@/lib/elo'
import { selectNextPair } from '@/lib/pairing'
import { revalidatePath } from 'next/cache'

export async function getNextPair(collectionId: number) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const [items, comparisons] = await Promise.all([
    db.item.findMany({ where: { collectionId } }),
    db.comparison.findMany({ where: { itemA: { collectionId } } }),
  ])

  return selectNextPair(items, comparisons)
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
