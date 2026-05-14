'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import type { Role } from '@/lib/generated/prisma/client'

/**
 * Create a collection. The creator is recorded as `ownerId` (the row's author)
 * and also gets a CollectionMembership with the role they chose for themselves
 * — that membership, not `ownerId`, is what authorizes access.
 */
export async function createCollection(
  name: string,
  description = '',
  role: Role = 'operator',
) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  const userId = parseInt(session.user.id)

  const collection = await db.collection.create({
    data: {
      name,
      description,
      owner: { connect: { id: userId } },
    },
  })
  await db.collectionMembership.create({
    data: { collectionId: collection.id, userId, role },
  })

  revalidatePath('/')
  return collection
}

/**
 * Every collection the current user is a member of, with their per-collection
 * role and the collection's item ids. This is the membership-aware replacement
 * for `getUserCollections` — a curator sees collections they were invited to,
 * not just ones they own.
 */
export async function getUserMemberships() {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  return db.collectionMembership.findMany({
    where: { userId: parseInt(session.user.id) },
    include: { collection: { include: { items: { select: { id: true } } } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getCollection(id: number) {
  // The (curator) layout already redirects unauthenticated, non-demo requests
  // to /login, so by the time a page calls this helper a session SHOULD exist.
  // Returns null on a missing session or missing membership. This feeds the
  // ranked-tier VIEW, which is operator-level: any member (operator OR curator)
  // can view rankings — only the ranking *actions* (actions/ranking.ts) are
  // curator-level. The returned `viewerRole` lets the page decide whether to
  // gate in-progress results (operators see results only once the ranking is
  // completed). Pages already treat null as "not found".
  const session = await auth()
  if (!session?.user?.id) return null

  const membership = await db.collectionMembership.findUnique({
    where: {
      collectionId_userId: { collectionId: id, userId: parseInt(session.user.id) },
    },
  })
  if (!membership) return null

  const collection = await db.collection.findFirst({
    where: { id },
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
  if (!collection) return null

  return { ...collection, viewerRole: membership.role }
}
