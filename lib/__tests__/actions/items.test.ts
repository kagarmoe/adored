import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockDb = vi.hoisted(() => ({
  item: {
    create: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: mockDb }))

import { createItem, updateItem } from '@/actions/items'

const session = { user: { id: '1' } }

describe('createItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(session)
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(createItem(1, {})).rejects.toThrow('Unauthorized')
  })

  it('creates item with collectionId', async () => {
    mockDb.item.create.mockResolvedValue({ id: 1, collectionId: 5 })
    await createItem(5, {})
    expect(mockDb.item.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ collectionId: 5 }) })
    )
  })

  it('creates item with provided metadata', async () => {
    mockDb.item.create.mockResolvedValue({ id: 1 })
    await createItem(5, { brand: 'Gucci', style: 'Bamboo', color: 'Black', material: 'Leather' })
    expect(mockDb.item.create).toHaveBeenCalledWith({
      data: { collectionId: 5, brand: 'Gucci', style: 'Bamboo', color: 'Black', material: 'Leather' },
    })
  })

  it('creates item with no metadata (empty object)', async () => {
    mockDb.item.create.mockResolvedValue({ id: 1 })
    await expect(createItem(5, {})).resolves.toBeDefined()
  })

  it('returns the created item', async () => {
    const item = { id: 42, collectionId: 5, brand: 'Prada' }
    mockDb.item.create.mockResolvedValue(item)
    expect(await createItem(5, { brand: 'Prada' })).toEqual(item)
  })
})

describe('updateItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(session)
    mockDb.item.update.mockResolvedValue({ id: 1, collectionId: 5, brand: 'Updated' })
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(updateItem(1, {})).rejects.toThrow('Unauthorized')
  })

  it('updates item by id', async () => {
    await updateItem(1, { brand: 'Updated' })
    expect(mockDb.item.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { brand: 'Updated' },
    })
  })

  it('returns the updated item', async () => {
    const result = await updateItem(1, { brand: 'Updated' })
    expect(result.brand).toBe('Updated')
  })

  it('can update partial fields', async () => {
    await updateItem(1, { color: 'Red' })
    expect(mockDb.item.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { color: 'Red' } })
    )
  })
})
