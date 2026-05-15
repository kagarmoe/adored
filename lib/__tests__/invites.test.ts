import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = vi.hoisted(() => ({
  collectionInvite: { findMany: vi.fn(), update: vi.fn() },
  collectionMembership: { upsert: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db: mockDb }))

import { claimInvites } from '@/lib/invites'

describe('claimInvites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('only looks at unaccepted invites for that email', async () => {
    mockDb.collectionInvite.findMany.mockResolvedValue([])
    await claimInvites(7, 'a@b.com')
    expect(mockDb.collectionInvite.findMany).toHaveBeenCalledWith({
      where: { email: 'a@b.com', acceptedAt: null },
    })
  })

  it('does nothing when there are no pending invites', async () => {
    mockDb.collectionInvite.findMany.mockResolvedValue([])
    await claimInvites(7, 'a@b.com')
    expect(mockDb.collectionMembership.upsert).not.toHaveBeenCalled()
    expect(mockDb.collectionInvite.update).not.toHaveBeenCalled()
  })

  it('converts each pending invite into a membership and stamps acceptedAt', async () => {
    mockDb.collectionInvite.findMany.mockResolvedValue([
      { id: 1, collectionId: 10, email: 'a@b.com', role: 'curator' },
    ])
    await claimInvites(7, 'a@b.com')
    expect(mockDb.collectionMembership.upsert).toHaveBeenCalledWith({
      where: { collectionId_userId: { collectionId: 10, userId: 7 } },
      create: { collectionId: 10, userId: 7, role: 'curator' },
      update: {},
    })
    expect(mockDb.collectionInvite.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { acceptedAt: expect.any(Date) },
    })
  })

  it('preserves the invite role when creating the membership', async () => {
    mockDb.collectionInvite.findMany.mockResolvedValue([
      { id: 2, collectionId: 11, email: 'a@b.com', role: 'operator' },
    ])
    await claimInvites(7, 'a@b.com')
    expect(mockDb.collectionMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { collectionId: 11, userId: 7, role: 'operator' },
      }),
    )
  })
})
