import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockDb = vi.hoisted(() => ({
  collection: {
    findUnique: vi.fn(),
  },
  item: {
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  comparison: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: mockDb }))

import { getNextPair, submitComparison } from '@/actions/ranking'

const session = { user: { id: '1' } }
const itemA = { id: 1, eloRating: 1000, collectionId: 10, brand: 'A', style: 'a' }
const itemB = { id: 2, eloRating: 1000, collectionId: 10, brand: 'B', style: 'b' }

describe('getNextPair', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(session)
    mockDb.collection.findUnique.mockResolvedValue({ id: 10, ownerId: 1 })
    mockDb.item.findMany.mockResolvedValue([itemA, itemB])
    mockDb.comparison.findMany.mockResolvedValue([])
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(getNextPair(10)).rejects.toThrow('Unauthorized')
  })

  it('throws when the collection does not exist', async () => {
    mockDb.collection.findUnique.mockResolvedValue(null)
    await expect(getNextPair(10)).rejects.toThrow('Unauthorized')
  })

  it('throws when the collection belongs to another user', async () => {
    mockDb.collection.findUnique.mockResolvedValue({ id: 10, ownerId: 99 })
    await expect(getNextPair(10)).rejects.toThrow('Unauthorized')
  })

  it('does not query items when ownership check fails', async () => {
    mockDb.collection.findUnique.mockResolvedValue({ id: 10, ownerId: 99 })
    await expect(getNextPair(10)).rejects.toThrow('Unauthorized')
    expect(mockDb.item.findMany).not.toHaveBeenCalled()
  })

  it('fetches items and comparisons for the collection', async () => {
    await getNextPair(10)
    expect(mockDb.item.findMany).toHaveBeenCalledWith({ where: { collectionId: 10 } })
    expect(mockDb.comparison.findMany).toHaveBeenCalledWith({ where: { itemA: { collectionId: 10 } } })
  })

  it('returns a pair when items exist', async () => {
    const result = await getNextPair(10)
    expect(result.pair).not.toBeNull()
    expect(result.pair!.itemA).toBeDefined()
    expect(result.pair!.itemB).toBeDefined()
  })

  it('returns null pair when fewer than 2 items', async () => {
    mockDb.item.findMany.mockResolvedValue([itemA])
    const result = await getNextPair(10)
    expect(result.pair).toBeNull()
  })

  it('returns items array and comparison count', async () => {
    mockDb.comparison.findMany.mockResolvedValue([
      { itemAId: 1, itemBId: 2, winnerId: 1 },
    ])
    const result = await getNextPair(10)
    expect(result.items).toHaveLength(2)
    expect(result.comparisonCount).toBe(1)
  })

  it('preserves brand and style on the returned pair', async () => {
    const result = await getNextPair(10)
    expect(result.pair!.itemA.brand).toBeDefined()
    expect(result.pair!.itemA.style).toBeDefined()
  })
})

describe('submitComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(session)
    mockDb.collection.findUnique.mockResolvedValue({ id: 10, ownerId: 1 })
    mockDb.item.findUniqueOrThrow.mockImplementation(({ where }: { where: { id: number } }) =>
      Promise.resolve(where.id === 1 ? itemA : itemB)
    )
    mockDb.$transaction.mockResolvedValue(undefined)
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(submitComparison(10, 1, 2, 1, 'shown')).rejects.toThrow('Unauthorized')
  })

  it('throws when the collection does not exist', async () => {
    mockDb.collection.findUnique.mockResolvedValue(null)
    await expect(submitComparison(10, 1, 2, 1, 'shown')).rejects.toThrow('Unauthorized')
  })

  it('throws when the collection belongs to another user', async () => {
    mockDb.collection.findUnique.mockResolvedValue({ id: 10, ownerId: 99 })
    await expect(submitComparison(10, 1, 2, 1, 'shown')).rejects.toThrow('Unauthorized')
    expect(mockDb.$transaction).not.toHaveBeenCalled()
  })

  it('throws when winner is not one of the two items', async () => {
    await expect(submitComparison(10, 1, 2, 99, 'shown')).rejects.toThrow('Winner must be one of the two items')
  })

  it('runs a transaction on success', async () => {
    await submitComparison(10, 1, 2, 1, 'shown')
    expect(mockDb.$transaction).toHaveBeenCalled()
  })

  it('fetches both winner and loser items', async () => {
    await submitComparison(10, 1, 2, 1, 'shown')
    expect(mockDb.item.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 1 } })
    expect(mockDb.item.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 2 } })
  })

  it('accepts itemB as winner', async () => {
    await expect(submitComparison(10, 1, 2, 2, 'shown')).resolves.not.toThrow()
  })

  it('transaction includes comparison creation and two elo updates', async () => {
    await submitComparison(10, 1, 2, 1, 'shown')
    const txArgs = mockDb.$transaction.mock.calls[0][0] as unknown[]
    expect(txArgs).toHaveLength(3)
  })
})
