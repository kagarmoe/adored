import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockPut = vi.hoisted(() => vi.fn())
const mockDb = vi.hoisted(() => ({
  item: { findUnique: vi.fn() },
  photo: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
}))

vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@vercel/blob', () => ({ put: (...args: unknown[]) => mockPut(...args) }))
vi.mock('@/lib/db', () => ({ db: mockDb }))

import { uploadPhoto, togglePhotoBackground } from '@/actions/photos'

const session = { user: { id: '1' } }
const item = { id: 1, collectionId: 10 }

function makeFormData(opts: { name?: string; processed?: boolean; processedName?: string } = {}) {
  const { name = 'bag.jpg', processed = false, processedName = 'bag.png' } = opts
  const fd = new FormData()
  fd.append('file', new File(['data'], name, { type: 'image/jpeg' }))
  if (processed) fd.append('processed', new File(['png'], processedName, { type: 'image/png' }))
  return fd
}

describe('uploadPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(session)
    mockDb.item.findUnique.mockResolvedValue(item)
    mockDb.photo.findFirst.mockResolvedValue(null)
    mockPut.mockImplementation(async (path: string) => ({
      url: `https://blob.vercel.app/${path}`,
    }))
    mockDb.photo.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 1,
      ...data,
    }))
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

  it('uploads original file to correct blob path', async () => {
    await uploadPhoto(1, makeFormData({ name: 'my-bag.jpg' }))
    expect(mockPut).toHaveBeenCalledWith(
      'collections/10/items/1/my-bag.jpg',
      expect.any(File),
      expect.objectContaining({ access: 'public' }),
    )
  })

  it('sets isHero to true for first photo', async () => {
    mockDb.photo.findFirst.mockResolvedValue(null)
    await uploadPhoto(1, makeFormData())
    expect(mockDb.photo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isHero: true }) }),
    )
  })

  it('sets isHero to false when hero already exists', async () => {
    mockDb.photo.findFirst.mockResolvedValue({ id: 1, isHero: true })
    await uploadPhoto(1, makeFormData())
    expect(mockDb.photo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isHero: false }) }),
    )
  })

  it('returns the created photo', async () => {
    const photo = { id: 5, itemId: 1, blobKey: 'url', originalBlobKey: 'url', bgRemoved: false, isHero: true }
    mockDb.photo.create.mockResolvedValue(photo)
    expect(await uploadPhoto(1, makeFormData())).toEqual(photo)
  })

  describe('without processed file (fallback)', () => {
    it('stores blobKey == originalBlobKey and bgRemoved=false', async () => {
      const url = 'https://blob.vercel.app/collections/10/items/1/bag.jpg'
      mockPut.mockResolvedValue({ url })
      await uploadPhoto(1, makeFormData())
      const data = mockDb.photo.create.mock.calls[0][0].data
      expect(data.blobKey).toBe(url)
      expect(data.originalBlobKey).toBe(url)
      expect(data.bgRemoved).toBe(false)
    })

    it('only puts once (only the original)', async () => {
      await uploadPhoto(1, makeFormData())
      expect(mockPut).toHaveBeenCalledTimes(1)
    })
  })

  describe('with processed file', () => {
    it('puts both original and processed', async () => {
      await uploadPhoto(1, makeFormData({ processed: true }))
      expect(mockPut).toHaveBeenCalledTimes(2)
    })

    it('stores distinct blobKey (processed) and originalBlobKey (original) with bgRemoved=true', async () => {
      mockPut
        .mockResolvedValueOnce({ url: 'https://blob.vercel.app/orig.jpg' })
        .mockResolvedValueOnce({ url: 'https://blob.vercel.app/proc.png' })
      await uploadPhoto(1, makeFormData({ processed: true }))
      const data = mockDb.photo.create.mock.calls[0][0].data
      expect(data.originalBlobKey).toBe('https://blob.vercel.app/orig.jpg')
      expect(data.blobKey).toBe('https://blob.vercel.app/proc.png')
      expect(data.bgRemoved).toBe(true)
    })

    it('uploads processed file to a .png path under the same item dir', async () => {
      await uploadPhoto(1, makeFormData({ name: 'bag.jpg', processed: true, processedName: 'bag.png' }))
      const paths = mockPut.mock.calls.map(c => c[0])
      expect(paths[0]).toBe('collections/10/items/1/bag.jpg')
      expect(paths[1]).toMatch(/^collections\/10\/items\/1\/.+\.png$/)
    })
  })
})

describe('togglePhotoBackground', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(session)
    mockDb.item.findUnique.mockResolvedValue(item)
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(togglePhotoBackground(1)).rejects.toThrow('Unauthorized')
  })

  it('throws when photo not found', async () => {
    mockDb.photo.findUnique.mockResolvedValue(null)
    await expect(togglePhotoBackground(999)).rejects.toThrow('Photo not found')
  })

  it('does nothing when photo has no originalBlobKey (legacy/no-op)', async () => {
    mockDb.photo.findUnique.mockResolvedValue({
      id: 1,
      itemId: 1,
      blobKey: 'https://blob/x.jpg',
      originalBlobKey: '',
      bgRemoved: false,
      item,
    })
    await togglePhotoBackground(1)
    expect(mockDb.photo.update).not.toHaveBeenCalled()
  })

  it('flips bgRemoved=true → false', async () => {
    mockDb.photo.findUnique.mockResolvedValue({
      id: 1,
      itemId: 1,
      blobKey: 'https://blob/proc.png',
      originalBlobKey: 'https://blob/orig.jpg',
      bgRemoved: true,
      item,
    })
    mockDb.photo.update.mockResolvedValue({})
    await togglePhotoBackground(1)
    expect(mockDb.photo.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { bgRemoved: false },
    })
  })

  it('flips bgRemoved=false → true when a processed version exists', async () => {
    mockDb.photo.findUnique.mockResolvedValue({
      id: 1,
      itemId: 1,
      blobKey: 'https://blob/orig.jpg',
      originalBlobKey: 'https://blob/orig.jpg',
      bgRemoved: false,
      item,
    })
    mockDb.photo.update.mockResolvedValue({})
    await togglePhotoBackground(1)
    expect(mockDb.photo.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { bgRemoved: true },
    })
  })
})
