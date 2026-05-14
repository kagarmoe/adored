'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { assertCollectionOwner, assertItemOwner } from '@/lib/authz'
import { revalidatePath } from 'next/cache'

export async function createItem(
  collectionId: number,
  data: { brand?: string; style?: string; color?: string; material?: string }
) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  await assertCollectionOwner(collectionId, session.user.id)

  const item = await db.item.create({
    data: {
      collectionId,
      ...data,
    },
  })

  revalidatePath(`/collections/${collectionId}`)
  return item
}

export async function updateItem(
  itemId: number,
  data: { brand?: string; style?: string; color?: string; material?: string }
) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  await assertItemOwner(itemId, session.user.id)

  const item = await db.item.update({
    where: { id: itemId },
    data,
  })

  revalidatePath(`/collections/${item.collectionId}`)
  return item
}
