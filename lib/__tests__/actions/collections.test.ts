import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockDb = vi.hoisted(() => ({
  collection: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  collectionMembership: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}))

vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: mockDb }))

import {
  createCollection,
  getUserCollections,
  getUserMemberships,
  getCollection,
} from '@/actions/collections'

const session = { user: { id: '1' } }

describe('createCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(session)
    mockDb.collection.create.mockResolvedValue({ id: 1 })
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(createCollection('My Bags')).rejects.toThrow('Unauthorized')
  })

  it('creates a collection with name and description, connected to the owner', async () => {
    const created = { id: 3, name: 'Summer', description: 'Hot weather bags' }
    mockDb.collection.create.mockResolvedValue(created)
    const result = await createCollection('Summer', 'Hot weather bags', 'curator')
    expect(result).toEqual(created)
    expect(mockDb.collection.create).toHaveBeenCalledWith({
      data: { name: 'Summer', description: 'Hot weather bags', owner: { connect: { id: 1 } } },
    })
  })

  it('defaults description to empty string', async () => {
    await createCollection('X')
    expect(mockDb.collection.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ description: '' }) })
    )
  })

  it('records a creator membership with the chosen role', async () => {
    mockDb.collection.create.mockResolvedValue({ id: 3, name: 'Summer' })
    await createCollection('Summer', '', 'curator')
    expect(mockDb.collectionMembership.create).toHaveBeenCalledWith({
      data: { collectionId: 3, userId: 1, role: 'curator' },
    })
  })

  it('defaults the creator role to operator', async () => {
    mockDb.collection.create.mockResolvedValue({ id: 4 })
    await createCollection('X')
    expect(mockDb.collectionMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'operator' }) })
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

  it('returns collections owned by the current user', async () => {
    const collections = [{ id: 1, name: 'A', items: [] }]
    mockDb.collection.findMany.mockResolvedValue(collections)
    const result = await getUserCollections()
    expect(result).toEqual(collections)
    expect(mockDb.collection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 1 } })
    )
  })
})

describe('getUserMemberships', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(session)
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(getUserMemberships()).rejects.toThrow('Unauthorized')
  })

  it('returns memberships for the current user with collection + role', async () => {
    const memberships = [{ role: 'curator', collection: { id: 1, name: 'A', items: [] } }]
    mockDb.collectionMembership.findMany.mockResolvedValue(memberships)
    const result = await getUserMemberships()
    expect(result).toEqual(memberships)
    expect(mockDb.collectionMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 1 } })
    )
  })

  it('orders results by createdAt descending and includes the collection items', async () => {
    mockDb.collectionMembership.findMany.mockResolvedValue([])
    await getUserMemberships()
    const call = mockDb.collectionMembership.findMany.mock.calls[0][0]
    expect(call.orderBy).toEqual({ createdAt: 'desc' })
    expect(call.include.collection.include.items.select.id).toBe(true)
  })
})

describe('getCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(session)
  })

  it('returns null when not authenticated (the curator layout redirects to /login)', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await getCollection(1)).toBeNull()
    expect(mockDb.collectionMembership.findUnique).not.toHaveBeenCalled()
  })

  it('returns null when the user has no membership on the collection', async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue(null)
    expect(await getCollection(999)).toBeNull()
    expect(mockDb.collection.findFirst).not.toHaveBeenCalled()
  })

  it('looks the membership up by the collection+user composite key', async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue({ role: 'curator' })
    mockDb.collection.findFirst.mockResolvedValue({ id: 1, items: [] })
    await getCollection(1)
    expect(mockDb.collectionMembership.findUnique).toHaveBeenCalledWith({
      where: { collectionId_userId: { collectionId: 1, userId: 1 } },
    })
  })

  it('returns the collection (with hero photos) when the user is a member', async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue({ role: 'operator' })
    mockDb.collection.findFirst.mockResolvedValue({ id: 1, items: [] })
    expect(await getCollection(1)).toEqual({ id: 1, items: [] })
    const call = mockDb.collection.findFirst.mock.calls[0][0]
    expect(call.where).toEqual({ id: 1 })
    expect(call.include.items.include.photos).toBeDefined()
  })
})
