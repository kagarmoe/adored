import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockDb = vi.hoisted(() => ({
  collection: { findUnique: vi.fn() },
  collectionMembership: { findUnique: vi.fn() },
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
vi.mock('@/actions/curators', () => ({ addCuratorByEmail: vi.fn() }))
vi.mock('@/components/operator/AddCuratorForm', () => ({
  AddCuratorForm: () => <div data-testid="add-curator-form" />,
}))

import CollectionPage from '../page'

const params = Promise.resolve({ id: '2' })

describe('CollectionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: '1' } })
    mockDb.collectionMembership.findUnique.mockResolvedValue({ role: 'operator' })
    mockDb.collection.findUnique.mockResolvedValue({ id: 2, name: 'Bags', items: [] })
  })

  it('redirects to /login when there is no session', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(CollectionPage({ params })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('calls notFound() when the caller has no membership on the collection', async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue(null)
    await expect(CollectionPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('calls notFound() when the collection row is missing', async () => {
    mockDb.collection.findUnique.mockResolvedValue(null)
    await expect(CollectionPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('renders for an operator member', async () => {
    const result = await CollectionPage({ params })
    expect(result).toBeTruthy()
    expect(mockNotFound).not.toHaveBeenCalled()
  })

  it('renders for a curator member (curator ⊇ operator)', async () => {
    mockDb.collectionMembership.findUnique.mockResolvedValue({ role: 'curator' })
    const result = await CollectionPage({ params })
    expect(result).toBeTruthy()
    expect(mockNotFound).not.toHaveBeenCalled()
  })
})
