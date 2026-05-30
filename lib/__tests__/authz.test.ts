/**
 * Real-DB tests for lib/authz — the hierarchical role gate (curator ⊇ operator)
 * is the entire authorization story for collections/items. Running it against
 * the real CollectionMembership composite key + Item.collectionId FK catches
 * the kind of column rename / unique-key change that a mocked Prisma can't.
 *
 * See docs/TESTING.md.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'

import { assertCollectionRole, assertItemRole } from '@/lib/authz'
import { getTestDb, resetTestDb, disconnectTestDb } from '@/lib/test-db'

const db = getTestDb()

afterAll(async () => {
  await disconnectTestDb()
})

async function seedUserAndCollection() {
  const user = await db.user.create({ data: { email: 'u@x.com', name: 'U' } })
  const collection = await db.collection.create({
    data: { name: 'C', ownerId: user.id },
  })
  return { user, collection }
}

async function grant(collectionId: number, userId: number, role: 'operator' | 'curator') {
  await db.collectionMembership.create({
    data: { collectionId, userId, role },
  })
}

describe('assertCollectionRole — hierarchical (curator ⊇ operator)', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  it('throws Unauthorized when the user has no membership', async () => {
    const { user, collection } = await seedUserAndCollection()
    await expect(
      assertCollectionRole(collection.id, String(user.id), 'operator'),
    ).rejects.toThrow('Unauthorized')
  })

  it("an operator membership satisfies an 'operator' requirement", async () => {
    const { user, collection } = await seedUserAndCollection()
    await grant(collection.id, user.id, 'operator')
    await expect(
      assertCollectionRole(collection.id, String(user.id), 'operator'),
    ).resolves.toBe('operator')
  })

  it("an operator membership does NOT satisfy a 'curator' requirement", async () => {
    const { user, collection } = await seedUserAndCollection()
    await grant(collection.id, user.id, 'operator')
    await expect(
      assertCollectionRole(collection.id, String(user.id), 'curator'),
    ).rejects.toThrow('Unauthorized')
  })

  it("a curator membership satisfies both 'operator' and 'curator' requirements", async () => {
    const { user, collection } = await seedUserAndCollection()
    await grant(collection.id, user.id, 'curator')
    await expect(
      assertCollectionRole(collection.id, String(user.id), 'operator'),
    ).resolves.toBe('curator')
    await expect(
      assertCollectionRole(collection.id, String(user.id), 'curator'),
    ).resolves.toBe('curator')
  })

  it("a membership on a different collection does NOT grant access here", async () => {
    const { user, collection } = await seedUserAndCollection()
    const otherCollection = await db.collection.create({
      data: { name: 'Other', ownerId: user.id },
    })
    await grant(otherCollection.id, user.id, 'curator')
    await expect(
      assertCollectionRole(collection.id, String(user.id), 'operator'),
    ).rejects.toThrow('Unauthorized')
  })
})

describe('assertItemRole', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  it('throws Unauthorized when the item does not exist (no existence leak)', async () => {
    await expect(assertItemRole(99999, '1', 'operator')).rejects.toThrow('Unauthorized')
  })

  it('throws Unauthorized when the caller has no membership on the item collection', async () => {
    const { user, collection } = await seedUserAndCollection()
    const item = await db.item.create({ data: { collectionId: collection.id } })
    await expect(
      assertItemRole(item.id, String(user.id), 'operator'),
    ).rejects.toThrow('Unauthorized')
  })

  it('returns the item when the caller has a satisfying membership', async () => {
    const { user, collection } = await seedUserAndCollection()
    await grant(collection.id, user.id, 'curator')
    const item = await db.item.create({
      data: { collectionId: collection.id, brand: 'B' },
    })
    const result = await assertItemRole(item.id, String(user.id), 'operator')
    expect(result.id).toBe(item.id)
    expect(result.collectionId).toBe(collection.id)
    expect(result.brand).toBe('B')
  })
})
