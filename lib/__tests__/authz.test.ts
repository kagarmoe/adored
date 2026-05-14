import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = vi.hoisted(() => ({
  collection: { findUnique: vi.fn() },
  item: { findUnique: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))

import { assertCollectionOwner, assertItemOwner } from '@/lib/authz'

describe('assertCollectionOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws Unauthorized when the collection does not exist', async () => {
    mockDb.collection.findUnique.mockResolvedValue(null)
    await expect(assertCollectionOwner(10, '1')).rejects.toThrow('Unauthorized')
  })

  it('throws Unauthorized when the collection belongs to another user', async () => {
    mockDb.collection.findUnique.mockResolvedValue({ id: 10, ownerId: 99 })
    await expect(assertCollectionOwner(10, '1')).rejects.toThrow('Unauthorized')
  })

  it('resolves when the caller owns the collection', async () => {
    mockDb.collection.findUnique.mockResolvedValue({ id: 10, ownerId: 1 })
    await expect(assertCollectionOwner(10, '1')).resolves.toBeUndefined()
  })
})

describe('assertItemOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws Unauthorized when the item does not exist', async () => {
    mockDb.item.findUnique.mockResolvedValue(null)
    await expect(assertItemOwner(5, '1')).rejects.toThrow('Unauthorized')
  })

  it("throws Unauthorized when the item's collection belongs to another user", async () => {
    mockDb.item.findUnique.mockResolvedValue({
      id: 5,
      collectionId: 10,
      collection: { id: 10, ownerId: 99 },
    })
    await expect(assertItemOwner(5, '1')).rejects.toThrow('Unauthorized')
  })

  it('returns the item when the caller owns its collection', async () => {
    const item = { id: 5, collectionId: 10, collection: { id: 10, ownerId: 1 } }
    mockDb.item.findUnique.mockResolvedValue(item)
    await expect(assertItemOwner(5, '1')).resolves.toEqual(item)
  })
})
