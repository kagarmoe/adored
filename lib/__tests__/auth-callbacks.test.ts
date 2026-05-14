import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}))
const mockClaimInvites = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/invites', () => ({ claimInvites: mockClaimInvites }))

import { signInCallback, jwtCallback, sessionCallback } from '@/lib/auth-callbacks'

describe('signInCallback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows sign-in for any verified email and claims pending invites', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 7, email: 'a@b.com' })
    const ok = await signInCallback({ user: { email: 'a@b.com' } })
    expect(ok).toBe(true)
    expect(mockClaimInvites).toHaveBeenCalledWith(7, 'a@b.com')
  })

  it('rejects sign-in when there is no email', async () => {
    expect(await signInCallback({ user: {} })).toBe(false)
    expect(mockClaimInvites).not.toHaveBeenCalled()
  })
})

describe('jwtCallback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('puts the db user id on the token and never a role', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 9, email: 'c@d.com' })
    const token = await jwtCallback({ token: {}, user: { email: 'c@d.com' } })
    expect(token.id).toBe('9')
    expect('role' in token).toBe(false)
  })

  it('leaves the token untouched on subsequent requests (no user)', async () => {
    const token = await jwtCallback({ token: { id: '9' } })
    expect(token).toEqual({ id: '9' })
    expect(mockDb.user.findUnique).not.toHaveBeenCalled()
  })
})

describe('sessionCallback', () => {
  it('copies id onto session.user and never a role', async () => {
    const session = await sessionCallback({
      session: { user: {}, expires: '2099-01-01T00:00:00.000Z' } as never,
      token: { id: '9' },
    })
    expect(session.user.id).toBe('9')
    expect('role' in session.user).toBe(false)
  })
})
