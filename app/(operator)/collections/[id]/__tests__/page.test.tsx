import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockDb = vi.hoisted(() => ({
  collection: { findFirst: vi.fn() },
}))
const mockRedirect = vi.hoisted(() => vi.fn((): never => {
  throw new Error('NEXT_REDIRECT')
}))
const mockNotFound = vi.hoisted(() => vi.fn((): never => {
  throw new Error('NEXT_NOT_FOUND')
}))

vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}))

import CollectionPage from '../page'

const params = Promise.resolve({ id: '2' })

describe('CollectionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: '1' } })
    mockDb.collection.findFirst.mockResolvedValue({ id: 2, name: 'Bags', items: [] })
  })

  it('redirects to /login when there is no session', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(CollectionPage({ params })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('scopes the collection lookup to the signed-in user', async () => {
    await CollectionPage({ params })
    expect(mockDb.collection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 2, ownerId: 1 }),
      }),
    )
  })

  it('calls notFound() when the collection is not owned by the caller', async () => {
    // owner-scoped query returns null for a collection the caller does not own
    mockDb.collection.findFirst.mockResolvedValue(null)
    await expect(CollectionPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('renders the collection when the caller owns it', async () => {
    const result = await CollectionPage({ params })
    expect(result).toBeTruthy()
    expect(mockNotFound).not.toHaveBeenCalled()
  })
})
