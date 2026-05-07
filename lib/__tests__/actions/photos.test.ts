import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockPut = vi.hoisted(() => vi.fn())
const mockDb = vi.hoisted(() => ({
  item: { findUnique: vi.fn() },
  photo: { findFirst: vi.fn(), create: vi.fn() },
}))

vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@vercel/blob', () => ({ put: (...args: unknown[]) => mockPut(...args) }))
vi.mock('@/lib/db', () => ({ db: mockDb }))

import { uploadPhoto } from '@/actions/photos'

const session = { user: { id: '1' } }
const item = { id: 1, collectionId: 10 }

function makeFormData(name = 'bag.jpg') {
  const fd = new FormData()
  fd.append('file', new File(['data'], name, { type: 'image/jpeg' }))
  return fd
}

describe('uploadPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(session)
    mockDb.item.findUnique.mockResolvedValue(item)
    mockDb.photo.findFirst.mockResolvedValue(null)
    mockPut.mockResolvedValue({ url: 'https://blob.vercel.app/collections/10/items/1/bag.jpg' })
    mockDb.photo.create.mockResolvedValue({ id: 1, itemId: 1, blobKey: 'https://blob.vercel.app/...', isHero: true })
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(uploadPhoto(1, makeFormData())).rejects.toThrow('Unauthorized')
  })

  it('throws when no file in formData', async () => {
    await expect(uploadPhoto(1, new FormData())).rejects.toThrow('No file provided')
  })

  it('throws when item not found', async () => {
    mockDb.item.findUnique.mockResolvedValue(null)
    await expect(uploadPhoto(999, makeFormData())).rejects.toThrow('Item not found')
  })

  it('uploads to correct blob path', async () => {
    await uploadPhoto(1, makeFormData('my-bag.jpg'))
    expect(mockPut).toHaveBeenCalledWith(
      'collections/10/items/1/my-bag.jpg',
      expect.any(File),
      expect.objectContaining({ access: 'public' })
    )
  })

  it('sets isHero to true for first photo', async () => {
    mockDb.photo.findFirst.mockResolvedValue(null)
    await uploadPhoto(1, makeFormData())
    expect(mockDb.photo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isHero: true }) })
    )
  })

  it('sets isHero to false when hero already exists', async () => {
    mockDb.photo.findFirst.mockResolvedValue({ id: 1, isHero: true })
    await uploadPhoto(1, makeFormData())
    expect(mockDb.photo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isHero: false }) })
    )
  })

  it('stores blob URL as blobKey', async () => {
    const url = 'https://blob.vercel.app/x.jpg'
    mockPut.mockResolvedValue({ url })
    await uploadPhoto(1, makeFormData())
    expect(mockDb.photo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ blobKey: url }) })
    )
  })

  it('returns the created photo', async () => {
    const photo = { id: 5, itemId: 1, blobKey: 'url', isHero: true }
    mockDb.photo.create.mockResolvedValue(photo)
    expect(await uploadPhoto(1, makeFormData())).toEqual(photo)
  })
})
