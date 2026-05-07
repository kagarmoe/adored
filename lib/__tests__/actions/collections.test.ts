import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockDb = vi.hoisted(() => ({
  collection: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
}))

vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: mockDb }))

import { createCollection, getUserCollections, getCollection } from '@/actions/collections'

const session = { user: { id: '1' } }

describe('createCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(session)
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(createCollection('My Bags')).rejects.toThrow('Unauthorized')
  })

  it('creates a collection with name and description', async () => {
    const created = { id: 1, name: 'Summer', description: 'Hot weather bags' }
    mockDb.collection.create.mockResolvedValue(created)
    const result = await createCollection('Summer', 'Hot weather bags')
    expect(result).toEqual(created)
    expect(mockDb.collection.create).toHaveBeenCalledWith({
      data: { name: 'Summer', description: 'Hot weather bags', owner: { connect: { id: 1 } } },
    })
  })

  it('defaults description to empty string', async () => {
    mockDb.collection.create.mockResolvedValue({ id: 1, name: 'X', description: '' })
    await createCollection('X')
    expect(mockDb.collection.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ description: '' }) })
    )
  })

  it('connects to owner using parsed integer id', async () => {
    mockDb.collection.create.mockResolvedValue({ id: 1 })
    await createCollection('X')
    expect(mockDb.collection.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ owner: { connect: { id: 1 } } }) })
    )
  })
})

describe('getUserCollections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(session)
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(getUserCollections()).rejects.toThrow('Unauthorized')
  })

  it('returns collections for the current user', async () => {
    const collections = [{ id: 1, name: 'A', items: [] }]
    mockDb.collection.findMany.mockResolvedValue(collections)
    const result = await getUserCollections()
    expect(result).toEqual(collections)
    expect(mockDb.collection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 1 } })
    )
  })

  it('orders results by createdAt descending', async () => {
    mockDb.collection.findMany.mockResolvedValue([])
    await getUserCollections()
    expect(mockDb.collection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } })
    )
  })

  it('includes item ids in response', async () => {
    mockDb.collection.findMany.mockResolvedValue([])
    await getUserCollections()
    const call = mockDb.collection.findMany.mock.calls[0][0]
    expect(call.include.items.select.id).toBe(true)
  })
})

describe('getCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(session)
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(getCollection(1)).rejects.toThrow('Unauthorized')
  })

  it('returns null for non-existent or unowned collection', async () => {
    mockDb.collection.findFirst.mockResolvedValue(null)
    expect(await getCollection(999)).toBeNull()
  })

  it('queries by both id and ownerId', async () => {
    mockDb.collection.findFirst.mockResolvedValue({ id: 1 })
    await getCollection(1)
    expect(mockDb.collection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, ownerId: 1 } })
    )
  })

  it('includes items with hero photos', async () => {
    mockDb.collection.findFirst.mockResolvedValue({ id: 1, items: [] })
    await getCollection(1)
    const call = mockDb.collection.findFirst.mock.calls[0][0]
    expect(call.include.items.include.photos).toBeDefined()
  })
})
