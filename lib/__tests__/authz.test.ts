import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = vi.hoisted(() => ({
  item: { findUnique: vi.fn() },
  collectionMembership: { findUnique: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))

import { assertCollectionRole, assertItemRole } from '@/lib/authz'

describe('assertCollectionRole — hierarchical (curator ⊇ operator)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws Unauthorized when the user has no membership', async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue(null)
    await expect(assertCollectionRole(10, '1', 'operator')).rejects.toThrow('Unauthorized')
  })

  it("looks the membership up by the collection+user composite key", async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue({ role: 'operator' })
    await assertCollectionRole(10, '2', 'operator')
    expect(mockDb.collectionMembership.findUnique).toHaveBeenCalledWith({
      where: { collectionId_userId: { collectionId: 10, userId: 2 } },
    })
  })

  it("an operator membership satisfies an 'operator' requirement", async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue({ role: 'operator' })
    await expect(assertCollectionRole(10, '1', 'operator')).resolves.toBe('operator')
  })

  it("an operator membership does NOT satisfy a 'curator' requirement", async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue({ role: 'operator' })
    await expect(assertCollectionRole(10, '1', 'curator')).rejects.toThrow('Unauthorized')
  })

  it("a curator membership satisfies an 'operator' requirement (curator ⊇ operator)", async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue({ role: 'curator' })
    await expect(assertCollectionRole(10, '1', 'operator')).resolves.toBe('curator')
  })

  it("a curator membership satisfies a 'curator' requirement", async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue({ role: 'curator' })
    await expect(assertCollectionRole(10, '1', 'curator')).resolves.toBe('curator')
  })
})

describe('assertItemRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws Unauthorized when the item does not exist', async () => {
    mockDb.item.findUnique.mockResolvedValue(null)
    await expect(assertItemRole(5, '1', 'operator')).rejects.toThrow('Unauthorized')
  })

  it('throws Unauthorized when the caller has no membership on the item collection', async () => {
    mockDb.item.findUnique.mockResolvedValue({ id: 5, collectionId: 10 })
    mockDb.collectionMembership.findUnique.mockResolvedValue(null)
    await expect(assertItemRole(5, '1', 'operator')).rejects.toThrow('Unauthorized')
  })

  it('returns the item when the caller has a satisfying membership', async () => {
    const item = { id: 5, collectionId: 10 }
    mockDb.item.findUnique.mockResolvedValue(item)
    mockDb.collectionMembership.findUnique.mockResolvedValue({ role: 'curator' })
    await expect(assertItemRole(5, '1', 'operator')).resolves.toEqual(item)
  })
})
