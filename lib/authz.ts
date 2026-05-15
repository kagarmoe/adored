import { db } from '@/lib/db'
import type { Role } from '@/lib/generated/prisma/client'

export type RequiredRole = 'operator' | 'curator'

/**
 * Roles are hierarchical: curator ⊇ operator. A curator membership has every
 * operator capability (managing content) PLUS ranking; an operator membership
 * can manage content but cannot rank. So a `'curator'` requirement is satisfied
 * only by a curator, but an `'operator'` requirement is satisfied by either.
 */
function roleSatisfies(have: Role, required: RequiredRole): boolean {
  if (required === 'operator') return have === 'operator' || have === 'curator'
  return have === 'curator'
}

/**
 * Throws `Unauthorized` unless `userId` has a CollectionMembership on
 * `collectionId` whose role satisfies `required` (see `roleSatisfies`). A
 * missing membership is treated as unauthorized so callers never leak whether
 * a collection id exists. Returns the actual membership role on success.
 */
export async function assertCollectionRole(
  collectionId: number,
  userId: string,
  required: RequiredRole,
): Promise<Role> {
  const membership = await db.collectionMembership.findUnique({
    where: { collectionId_userId: { collectionId, userId: Number(userId) } },
  })
  if (!membership || !roleSatisfies(membership.role, required)) {
    throw new Error('Unauthorized')
  }
  return membership.role
}

/**
 * Throws `Unauthorized` unless `userId` has a satisfying membership on the
 * collection the item belongs to. Returns the item so callers avoid a second
 * lookup. A missing item is treated as unauthorized (no existence leak).
 */
export async function assertItemRole(
  itemId: number,
  userId: string,
  required: RequiredRole,
) {
  const item = await db.item.findUnique({ where: { id: itemId } })
  if (!item) throw new Error('Unauthorized')
  await assertCollectionRole(item.collectionId, userId, required)
  return item
}
