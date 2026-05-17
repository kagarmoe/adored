/**
 * Real-DB tests for lib/invites.claimInvites — the function runs two writes per
 * pending invite (membership upsert + invite update) AND relies on the
 * (collectionId, userId) composite unique constraint to make the upsert
 * idempotent. A whole-`db` mock can't exercise that constraint.
 *
 * See docs/TESTING.md.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'

import { claimInvites } from '@/lib/invites'
import { getTestDb, resetTestDb, disconnectTestDb } from '@/lib/test-db'

const db = getTestDb()

afterAll(async () => {
  await disconnectTestDb()
})

beforeEach(async () => {
  await resetTestDb()
})

async function seedCollectionWithInviter(name: string) {
  const inviter = await db.user.create({
    data: { email: `inviter-${name}@x.com`, name: 'Inviter' },
  })
  const collection = await db.collection.create({
    data: { name, ownerId: inviter.id },
  })
  return { inviter, collection }
}

describe('claimInvites', () => {
  it('does nothing when there are no pending invites for the email', async () => {
    const user = await db.user.create({ data: { email: 'a@b.com', name: 'A' } })
    await claimInvites(user.id, 'a@b.com')
    expect(await db.collectionMembership.count()).toBe(0)
  })

  it('converts a pending invite into a membership and stamps acceptedAt', async () => {
    const { inviter, collection } = await seedCollectionWithInviter('Spring')
    await db.collectionInvite.create({
      data: {
        collectionId: collection.id,
        email: 'a@b.com',
        role: 'curator',
        invitedById: inviter.id,
      },
    })
    const user = await db.user.create({ data: { email: 'a@b.com', name: 'A' } })

    await claimInvites(user.id, 'a@b.com')

    const membership = await db.collectionMembership.findUniqueOrThrow({
      where: { collectionId_userId: { collectionId: collection.id, userId: user.id } },
    })
    expect(membership.role).toBe('curator')

    const invite = await db.collectionInvite.findFirstOrThrow({
      where: { collectionId: collection.id, email: 'a@b.com' },
    })
    expect(invite.acceptedAt).not.toBeNull()
  })

  it('preserves the invite role when creating the membership (operator vs curator)', async () => {
    const { inviter, collection } = await seedCollectionWithInviter('Spring')
    await db.collectionInvite.create({
      data: {
        collectionId: collection.id,
        email: 'a@b.com',
        role: 'operator',
        invitedById: inviter.id,
      },
    })
    const user = await db.user.create({ data: { email: 'a@b.com', name: 'A' } })

    await claimInvites(user.id, 'a@b.com')

    const membership = await db.collectionMembership.findUniqueOrThrow({
      where: { collectionId_userId: { collectionId: collection.id, userId: user.id } },
    })
    expect(membership.role).toBe('operator')
  })

  it('only looks at unaccepted invites — re-running is a no-op', async () => {
    const { inviter, collection } = await seedCollectionWithInviter('Spring')
    await db.collectionInvite.create({
      data: {
        collectionId: collection.id,
        email: 'a@b.com',
        role: 'curator',
        invitedById: inviter.id,
      },
    })
    const user = await db.user.create({ data: { email: 'a@b.com', name: 'A' } })

    await claimInvites(user.id, 'a@b.com')
    const firstStamp = (
      await db.collectionInvite.findFirstOrThrow({ where: { email: 'a@b.com' } })
    ).acceptedAt!

    // Second call: pending filter rules out the accepted invite, so no work.
    await claimInvites(user.id, 'a@b.com')
    const secondStamp = (
      await db.collectionInvite.findFirstOrThrow({ where: { email: 'a@b.com' } })
    ).acceptedAt!
    expect(secondStamp.getTime()).toBe(firstStamp.getTime())
    expect(await db.collectionMembership.count()).toBe(1)
  })

  it('handles many pending invites across distinct collections in one call', async () => {
    const a = await seedCollectionWithInviter('A')
    const b = await seedCollectionWithInviter('B')
    await db.collectionInvite.create({
      data: { collectionId: a.collection.id, email: 'x@y.com', role: 'curator', invitedById: a.inviter.id },
    })
    await db.collectionInvite.create({
      data: { collectionId: b.collection.id, email: 'x@y.com', role: 'operator', invitedById: b.inviter.id },
    })
    const user = await db.user.create({ data: { email: 'x@y.com', name: 'X' } })

    await claimInvites(user.id, 'x@y.com')

    const memberships = await db.collectionMembership.findMany({
      where: { userId: user.id },
      orderBy: { collectionId: 'asc' },
    })
    expect(memberships).toHaveLength(2)
    expect(memberships.map((m) => m.role).sort()).toEqual(['curator', 'operator'])
  })
})
