import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
const mockAssertRole = vi.hoisted(() => vi.fn())
const mockSendInviteEmail = vi.hoisted(() => vi.fn())
const mockDb = vi.hoisted(() => ({
  collection: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  collectionInvite: { upsert: vi.fn(), update: vi.fn() },
  collectionMembership: { upsert: vi.fn() },
}))

vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/authz', () => ({ assertCollectionRole: mockAssertRole }))
vi.mock('@/lib/email', () => ({ sendInviteEmail: mockSendInviteEmail }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addCuratorByEmail } from '@/actions/curators'

describe('addCuratorByEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: '1', name: 'Kimberly', email: 'k@x.com' } })
    mockAssertRole.mockResolvedValue('operator')
    mockDb.collection.findUnique.mockResolvedValue({ id: 5, name: 'Spring 2026' })
    mockDb.user.findUnique.mockResolvedValue(null)
    mockSendInviteEmail.mockResolvedValue(undefined)
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(addCuratorByEmail(5, 'c@d.com')).rejects.toThrow('Unauthorized')
  })

  it('requires the caller to be an operator of the collection', async () => {
    mockAssertRole.mockRejectedValue(new Error('Unauthorized'))
    await expect(addCuratorByEmail(5, 'c@d.com')).rejects.toThrow('Unauthorized')
    expect(mockAssertRole).toHaveBeenCalledWith(5, '1', 'operator')
  })

  it('records a pending invite (normalized email) when the invitee has no account', async () => {
    mockDb.user.findUnique.mockResolvedValue(null)
    await addCuratorByEmail(5, '  NewCurator@D.com ')
    expect(mockDb.collectionInvite.upsert).toHaveBeenCalledWith({
      where: { collectionId_email: { collectionId: 5, email: 'newcurator@d.com' } },
      create: { collectionId: 5, email: 'newcurator@d.com', role: 'curator', invitedById: 1 },
      update: {},
    })
    expect(mockDb.collectionMembership.upsert).not.toHaveBeenCalled()
  })

  it('claims the invite immediately when the invitee already has an account', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 42, email: 'existing@d.com' })
    await addCuratorByEmail(5, 'existing@d.com')
    expect(mockDb.collectionMembership.upsert).toHaveBeenCalledWith({
      where: { collectionId_userId: { collectionId: 5, userId: 42 } },
      create: { collectionId: 5, userId: 42, role: 'curator' },
      update: {},
    })
    expect(mockDb.collectionInvite.update).toHaveBeenCalledWith({
      where: { collectionId_email: { collectionId: 5, email: 'existing@d.com' } },
      data: { acceptedAt: expect.any(Date) },
    })
  })

  it('sends the invite notification email', async () => {
    await addCuratorByEmail(5, 'c@d.com')
    expect(mockSendInviteEmail).toHaveBeenCalledWith('c@d.com', 'Spring 2026', 'Kimberly')
  })

  it('does not fail the action when the invite email throws (best-effort)', async () => {
    mockSendInviteEmail.mockRejectedValue(new Error('Resend down'))
    await expect(addCuratorByEmail(5, 'c@d.com')).resolves.toBeUndefined()
    expect(mockDb.collectionInvite.upsert).toHaveBeenCalled()
  })
})
