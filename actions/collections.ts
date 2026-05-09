'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createCollection(name: string, description = '') {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const collection = await db.collection.create({
    data: {
      name,
      description,
      owner: { connect: { id: parseInt(session.user.id) } },
    },
  })

  revalidatePath('/')
  return collection
}

export async function getUserCollections() {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  return db.collection.findMany({
    where: { ownerId: parseInt(session.user.id) },
    include: { items: { select: { id: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getCollection(id: number) {
  // The (curator) layout already redirects unauthenticated, non-demo requests
  // to /login, so by the time a page calls this helper, a session SHOULD
  // exist. We return null on a missing session instead of throwing — pages
  // already treat null as "not found", and this gives us a single, clean
  // contract: pages assume `session OR isDemo`, the layout guarantees it.
  const session = await auth()
  if (!session?.user?.id) return null

  return db.collection.findFirst({
    where: { id, ownerId: parseInt(session.user.id) },
    include: {
      items: {
        include: {
          photos: { where: { isHero: true }, take: 1 },
          wins: true,
          comparisonsAsA: true,
          comparisonsAsB: true,
        },
      },
    },
  })
}
