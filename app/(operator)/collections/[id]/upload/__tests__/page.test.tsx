import { render, screen } from '@testing-library/react'
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
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/components/operator/NewItemUploader', () => ({
  NewItemUploader: ({ collectionId }: { collectionId: number }) => (
    <div data-testid="new-item-uploader">{collectionId}</div>
  ),
}))
vi.mock('@/components/operator/PhotoUploader', () => ({
  PhotoUploader: () => <div data-testid="photo-uploader" />,
}))
vi.mock('@/components/operator/PhotoCard', () => ({
  PhotoCard: () => <div data-testid="photo-card" />,
}))

import UploadPage from '../page'

const params = Promise.resolve({ id: '2' })

describe('UploadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: '1' } })
    mockDb.collection.findFirst.mockResolvedValue({ id: 2, name: 'Bags', items: [] })
  })

  it('redirects to /login when there is no session', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(UploadPage({ params })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('scopes the collection lookup to the signed-in user', async () => {
    await UploadPage({ params })
    expect(mockDb.collection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 2, ownerId: 1 }),
      }),
    )
  })

  it('calls notFound() when the collection is not owned by the caller', async () => {
    mockDb.collection.findFirst.mockResolvedValue(null)
    await expect(UploadPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('renders a discoverable new-item uploader for the collection', async () => {
    render(await UploadPage({ params }))
    expect(screen.getByTestId('new-item-uploader')).toHaveTextContent('2')
  })
})
