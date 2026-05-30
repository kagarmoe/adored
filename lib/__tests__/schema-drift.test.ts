/**
 * Schema-drift guard: the kind of bug a vi.mock('@/lib/db') test cannot catch.
 *
 * A mocked Prisma client has whatever shape the test pretends it has, so a
 * call like `db.photo.create({ data: { blobKey, originalBlobKey, bgRemoved }})`
 * passes even if the real `Photo` table is missing those columns. That's the
 * structural reason the 2026-05-15 demo-500 escaped the test suite.
 *
 * These tests exist explicitly to fail loud when someone drops or renames a
 * load-bearing column without updating callers — pglite raises the same
 * Postgres errors that Neon would in production.
 *
 * See docs/TESTING.md.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getTestDb, resetTestDb, disconnectTestDb } from '@/lib/test-db'

const db = getTestDb()

afterAll(async () => {
  await disconnectTestDb()
})

beforeEach(async () => {
  await resetTestDb()
})

describe('Photo.bgRemoved / originalBlobKey (purses-chh.3 regression class)', () => {
  // Both columns were added in migration 20260509060000. The action layer
  // (actions/photos.uploadPhoto) writes them on every insert; if either gets
  // dropped from `Photo` without a code update, the action 500s in production.
  // A mocked DB cannot tell you this; pglite does.
  it('round-trips the columns the upload action writes', async () => {
    const owner = await db.user.create({ data: { email: 'o@x.com', name: 'O' } })
    const collection = await db.collection.create({
      data: { name: 'C', ownerId: owner.id },
    })
    const item = await db.item.create({ data: { collectionId: collection.id } })

    const written = await db.photo.create({
      data: {
        itemId: item.id,
        blobKey: 'processed.png',
        originalBlobKey: 'original.jpg',
        bgRemoved: true,
        isHero: true,
      },
    })

    const read = await db.photo.findUniqueOrThrow({ where: { id: written.id } })
    expect(read.bgRemoved).toBe(true)
    expect(read.originalBlobKey).toBe('original.jpg')
    expect(read.blobKey).toBe('processed.png')
  })

  it('enforces the Photo.originalBlobKey unique constraint', async () => {
    const owner = await db.user.create({ data: { email: 'o@x.com', name: 'O' } })
    const collection = await db.collection.create({
      data: { name: 'C', ownerId: owner.id },
    })
    const item = await db.item.create({ data: { collectionId: collection.id } })
    await db.photo.create({
      data: {
        itemId: item.id,
        blobKey: 'a.png',
        originalBlobKey: 'shared.jpg',
      },
    })

    await expect(
      db.photo.create({
        data: {
          itemId: item.id,
          blobKey: 'b.png',
          originalBlobKey: 'shared.jpg', // duplicate
        },
      }),
    ).rejects.toThrow()
  })
})

describe('CollectionMembership composite unique (purses-72e)', () => {
  // Per-collection role model: each (collectionId, userId) pair must be
  // unique. authz + invite-claiming both look up by this composite key. A
  // mocked DB would let two memberships for the same pair exist.
  it('rejects a second membership for the same (collectionId, userId)', async () => {
    const user = await db.user.create({ data: { email: 'u@x.com', name: 'U' } })
    const collection = await db.collection.create({
      data: { name: 'C', ownerId: user.id },
    })
    await db.collectionMembership.create({
      data: { collectionId: collection.id, userId: user.id, role: 'operator' },
    })

    await expect(
      db.collectionMembership.create({
        data: { collectionId: collection.id, userId: user.id, role: 'curator' },
      }),
    ).rejects.toThrow()
  })
})

describe('Collection.rankingCompletedAt (purses-blr)', () => {
  // Operators only see ranked-tier results once a curator stamps
  // rankingCompletedAt. If this column is renamed/dropped, operators either
  // see results too early or never. Mocked tests would miss it.
  it('persists null by default and accepts a timestamp', async () => {
    const owner = await db.user.create({ data: { email: 'o@x.com', name: 'O' } })
    const c = await db.collection.create({
      data: { name: 'C', ownerId: owner.id },
    })
    const fresh = await db.collection.findUniqueOrThrow({ where: { id: c.id } })
    expect(fresh.rankingCompletedAt).toBeNull()

    const now = new Date()
    await db.collection.update({
      where: { id: c.id },
      data: { rankingCompletedAt: now },
    })
    const updated = await db.collection.findUniqueOrThrow({ where: { id: c.id } })
    expect(updated.rankingCompletedAt?.getTime()).toBe(now.getTime())
  })
})
