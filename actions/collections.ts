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
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

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
