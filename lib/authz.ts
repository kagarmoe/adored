import { db } from '@/lib/db'

/**
 * Throws `Unauthorized` unless `userId` owns the collection. Treats a missing
 * collection as unauthorized so callers never leak whether an id exists.
 */
export async function assertCollectionOwner(collectionId: number, userId: string) {
  const collection = await db.collection.findUnique({ where: { id: collectionId } })
  if (!collection || collection.ownerId !== Number(userId)) {
    throw new Error('Unauthorized')
  }
}

/**
 * Throws `Unauthorized` unless `userId` owns the collection the item belongs to.
 * Returns the item (with its collection) so callers can avoid a second lookup.
 */
export async function assertItemOwner(itemId: number, userId: string) {
  const item = await db.item.findUnique({
    where: { id: itemId },
    include: { collection: true },
  })
  if (!item || item.collection.ownerId !== Number(userId)) {
    throw new Error('Unauthorized')
  }
  return item
}
