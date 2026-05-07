import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  verificationToken: {
    create: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({ db: mockDb }))

import { PurseAdapter } from '@/lib/auth-adapter'

const dbUser = { id: 1, email: 'test@example.com', name: 'Tester', role: 'curator' }
const adapterUser = { id: '1', email: 'test@example.com', name: 'Tester', emailVerified: null, image: null }

describe('PurseAdapter', () => {
  let adapter: ReturnType<typeof PurseAdapter>

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = PurseAdapter()
  })

  describe('createUser', () => {
    it('throws — no self-signup allowed', async () => {
      await expect(adapter.createUser!({} as never)).rejects.toThrow()
    })
  })

  describe('getUser', () => {
    it('returns adapter user when found', async () => {
      mockDb.user.findUnique.mockResolvedValue(dbUser)
      const result = await adapter.getUser!('1')
      expect(result).toEqual(adapterUser)
      expect(mockDb.user.findUnique).toHaveBeenCalledWith({ where: { id: 1 } })
    })

    it('returns null when not found', async () => {
      mockDb.user.findUnique.mockResolvedValue(null)
      expect(await adapter.getUser!('999')).toBeNull()
    })
  })

  describe('getUserByEmail', () => {
    it('returns adapter user when found', async () => {
      mockDb.user.findUnique.mockResolvedValue(dbUser)
      const result = await adapter.getUserByEmail!('test@example.com')
      expect(result).toEqual(adapterUser)
      expect(mockDb.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } })
    })

    it('returns null when not found', async () => {
      mockDb.user.findUnique.mockResolvedValue(null)
      expect(await adapter.getUserByEmail!('nobody@example.com')).toBeNull()
    })
  })

  describe('getUserByAccount', () => {
    it('always returns null (OAuth disabled)', async () => {
      expect(await adapter.getUserByAccount!({} as never)).toBeNull()
    })
  })

  describe('updateUser', () => {
    it('updates name and returns adapter user', async () => {
      mockDb.user.update.mockResolvedValue({ ...dbUser, name: 'New Name' })
      const result = await adapter.updateUser!({ id: '1', name: 'New Name', emailVerified: null })
      expect(result.name).toBe('New Name')
      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'New Name' },
      })
    })
  })

  describe('linkAccount', () => {
    it('returns undefined (no-op)', async () => {
      expect(await adapter.linkAccount!({} as never)).toBeUndefined()
    })
  })

  describe('createVerificationToken', () => {
    it('creates token and returns it', async () => {
      const token = { identifier: 'test@example.com', token: 'abc123', expires: new Date() }
      mockDb.verificationToken.create.mockResolvedValue(token)
      const result = await adapter.createVerificationToken!(token)
      expect(result).toEqual(token)
      expect(mockDb.verificationToken.create).toHaveBeenCalledWith({ data: token })
    })
  })

  describe('useVerificationToken', () => {
    it('deletes and returns token on success', async () => {
      const token = { identifier: 'test@example.com', token: 'abc', expires: new Date() }
      mockDb.verificationToken.delete.mockResolvedValue(token)
      const result = await adapter.useVerificationToken!({ identifier: 'test@example.com', token: 'abc' })
      expect(result).toEqual(token)
    })

    it('returns null when token not found (Prisma throws)', async () => {
      mockDb.verificationToken.delete.mockRejectedValue(new Error('Not found'))
      const result = await adapter.useVerificationToken!({ identifier: 'x@y.com', token: 'bad' })
      expect(result).toBeNull()
    })
  })
})
