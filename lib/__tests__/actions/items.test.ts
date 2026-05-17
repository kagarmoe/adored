/**
 * Real-DB tests for actions/items.ts — drives createItem/updateItem against a
 * pglite-backed Postgres, so column-level changes to `Item` (eloRating default,
 * brand/style/color/material columns, the collectionId FK) fail loud.
 *
 * Only `@/auth` and `next/cache` are mocked. `@/lib/authz` is NOT mocked: its
 * own membership query runs against the same test DB, so a role-gate
 * regression in authz.ts also fails this suite.
 *
 * See docs/TESTING.md.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createItem, updateItem } from '@/actions/items'
import { getTestDb, resetTestDb, disconnectTestDb } from '@/lib/test-db'

const db = getTestDb()

afterAll(async () => {
  await disconnectTestDb()
})

async function seedUserCollectionMembership(role: 'operator' | 'curator') {
  const user = await db.user.create({ data: { email: 'u@x.com', name: 'U' } })
  const collection = await db.collection.create({
    data: { name: 'C', ownerId: user.id },
  })
  await db.collectionMembership.create({
    data: { collectionId: collection.id, userId: user.id, role },
  })
  return { user, collection }
}

describe('createItem', () => {
  beforeEach(async () => {
    await resetTestDb()
    vi.clearAllMocks()
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(createItem(1, {})).rejects.toThrow('Unauthorized')
  })

  it('throws Unauthorized when the caller has no membership on the collection', async () => {
    const user = await db.user.create({ data: { email: 'u@x.com', name: 'U' } })
    const owner = await db.user.create({ data: { email: 'o@x.com', name: 'O' } })
    const collection = await db.collection.create({
      data: { name: 'C', ownerId: owner.id },
    })
    mockAuth.mockResolvedValue({ user: { id: String(user.id) } })

    await expect(createItem(collection.id, {})).rejects.toThrow('Unauthorized')
    expect(await db.item.count()).toBe(0)
  })

  it('allows a curator-member (curator ⊇ operator) to create an item', async () => {
    const { user, collection } = await seedUserCollectionMembership('curator')
    mockAuth.mockResolvedValue({ user: { id: String(user.id) } })

    const item = await createItem(collection.id, { brand: 'Prada' })
    expect(item.collectionId).toBe(collection.id)
    expect(item.brand).toBe('Prada')
  })

  it('persists provided metadata and defaults missing fields', async () => {
    const { user, collection } = await seedUserCollectionMembership('operator')
    mockAuth.mockResolvedValue({ user: { id: String(user.id) } })

    const item = await createItem(collection.id, {
      brand: 'Gucci',
      style: 'Bamboo',
      color: 'Black',
      material: 'Leather',
    })
    const row = await db.item.findUniqueOrThrow({ where: { id: item.id } })
    expect(row).toMatchObject({
      brand: 'Gucci',
      style: 'Bamboo',
      color: 'Black',
      material: 'Leather',
    })
    // Schema-drift guard: the elo seed must be present, every item starts at
    // 1000. The ranking math (lib/elo.ts) assumes this.
    expect(row.eloRating).toBe(1000)
  })

  it('an empty metadata object yields an item with all-default columns', async () => {
    const { user, collection } = await seedUserCollectionMembership('operator')
    mockAuth.mockResolvedValue({ user: { id: String(user.id) } })

    const item = await createItem(collection.id, {})
    const row = await db.item.findUniqueOrThrow({ where: { id: item.id } })
    expect(row.brand).toBe('')
    expect(row.style).toBe('')
    expect(row.color).toBe('')
    expect(row.material).toBe('')
  })
})

describe('updateItem', () => {
  beforeEach(async () => {
    await resetTestDb()
    vi.clearAllMocks()
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(updateItem(1, {})).rejects.toThrow('Unauthorized')
  })

  it("throws Unauthorized when the caller has no membership on the item's collection", async () => {
    const me = await db.user.create({ data: { email: 'me@x.com', name: 'Me' } })
    const owner = await db.user.create({ data: { email: 'o@x.com', name: 'O' } })
    const collection = await db.collection.create({
      data: { name: 'C', ownerId: owner.id },
    })
    const item = await db.item.create({ data: { collectionId: collection.id } })
    mockAuth.mockResolvedValue({ user: { id: String(me.id) } })

    await expect(updateItem(item.id, { brand: 'X' })).rejects.toThrow('Unauthorized')

    const fresh = await db.item.findUniqueOrThrow({ where: { id: item.id } })
    expect(fresh.brand).toBe('') // unchanged
  })

  it('throws Unauthorized when the item does not exist', async () => {
    const { user } = await seedUserCollectionMembership('operator')
    mockAuth.mockResolvedValue({ user: { id: String(user.id) } })
    await expect(updateItem(99999, { brand: 'X' })).rejects.toThrow('Unauthorized')
  })

  it('updates the requested fields and leaves others untouched', async () => {
    const { user, collection } = await seedUserCollectionMembership('operator')
    mockAuth.mockResolvedValue({ user: { id: String(user.id) } })
    const item = await db.item.create({
      data: { collectionId: collection.id, brand: 'OLD', color: 'Red' },
    })

    await updateItem(item.id, { brand: 'NEW' })

    const fresh = await db.item.findUniqueOrThrow({ where: { id: item.id } })
    expect(fresh.brand).toBe('NEW')
    expect(fresh.color).toBe('Red')
  })
})
