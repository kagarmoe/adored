/**
 * Real-DB tests for actions/collections.ts — drives the actual Prisma client
 * against a per-test-truncated pglite Postgres (lib/test-db.ts), so schema
 * drift in `Collection`, `CollectionMembership`, or the relations between them
 * fails the test instead of silently passing against a hand-rolled mock.
 *
 * This is the **default pattern** for action-layer tests. See docs/TESTING.md.
 *
 * Only `@/auth` and `next/cache` are mocked — both are runtime concerns that
 * don't belong in a unit test (session/cookies, ISR cache).
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

const mockAuth = vi.hoisted(() => vi.fn())
vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  createCollection,
  getUserMemberships,
  getCollection,
} from '@/actions/collections'
import { getTestDb, resetTestDb, disconnectTestDb } from '@/lib/test-db'

const db = getTestDb()

async function seedUser(email = 'tester@example.com') {
  return db.user.create({ data: { email, name: 'Tester' } })
}

afterAll(async () => {
  await disconnectTestDb()
})

describe('createCollection', () => {
  beforeEach(async () => {
    await resetTestDb()
    vi.clearAllMocks()
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(createCollection('My Bags')).rejects.toThrow('Unauthorized')
  })

  it('persists a collection owned by the session user', async () => {
    const owner = await seedUser()
    mockAuth.mockResolvedValue({ user: { id: String(owner.id) } })

    const result = await createCollection('Summer', 'Hot weather bags', 'curator')

    const row = await db.collection.findUniqueOrThrow({ where: { id: result.id } })
    expect(row.name).toBe('Summer')
    expect(row.description).toBe('Hot weather bags')
    expect(row.ownerId).toBe(owner.id)
  })

  it('defaults description to empty string', async () => {
    const owner = await seedUser()
    mockAuth.mockResolvedValue({ user: { id: String(owner.id) } })

    const result = await createCollection('X')

    const row = await db.collection.findUniqueOrThrow({ where: { id: result.id } })
    expect(row.description).toBe('')
  })

  it('records a creator membership with the chosen role', async () => {
    const owner = await seedUser()
    mockAuth.mockResolvedValue({ user: { id: String(owner.id) } })

    const result = await createCollection('Summer', '', 'curator')

    const membership = await db.collectionMembership.findUniqueOrThrow({
      where: { collectionId_userId: { collectionId: result.id, userId: owner.id } },
    })
    expect(membership.role).toBe('curator')
  })

  it('defaults the creator role to operator', async () => {
    const owner = await seedUser()
    mockAuth.mockResolvedValue({ user: { id: String(owner.id) } })

    const result = await createCollection('X')

    const membership = await db.collectionMembership.findUniqueOrThrow({
      where: { collectionId_userId: { collectionId: result.id, userId: owner.id } },
    })
    expect(membership.role).toBe('operator')
  })

  it('rejects when the session user id does not match a real user row', async () => {
    // Schema drift guard: ownerId is a FK to User.id. Mocking the DB would
    // happily "create" with a dangling FK — the real DB raises P2003 here.
    mockAuth.mockResolvedValue({ user: { id: '999' } })
    await expect(createCollection('Ghost')).rejects.toThrow()
  })
})

describe('getUserMemberships', () => {
  beforeEach(async () => {
    await resetTestDb()
    vi.clearAllMocks()
  })

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    await expect(getUserMemberships()).rejects.toThrow('Unauthorized')
  })

  it('returns only memberships for the current user, newest first, with collection items', async () => {
    const me = await seedUser('me@x.com')
    const other = await seedUser('other@x.com')
    mockAuth.mockResolvedValue({ user: { id: String(me.id) } })

    const c1 = await db.collection.create({ data: { name: 'Mine A', ownerId: me.id } })
    const c2 = await db.collection.create({ data: { name: 'Mine B', ownerId: me.id } })
    const c3 = await db.collection.create({ data: { name: 'Theirs', ownerId: other.id } })
    await db.collectionMembership.create({ data: { collectionId: c1.id, userId: me.id, role: 'operator' } })
    await db.collectionMembership.create({ data: { collectionId: c2.id, userId: me.id, role: 'curator' } })
    await db.collectionMembership.create({ data: { collectionId: c3.id, userId: other.id, role: 'operator' } })
    await db.item.create({ data: { collectionId: c2.id, brand: 'Gucci' } })

    const result = await getUserMemberships()

    expect(result.map((m) => m.collectionId)).toEqual([c2.id, c1.id])
    const withItems = result.find((m) => m.collectionId === c2.id)!
    expect(withItems.collection.items).toHaveLength(1)
  })
})

describe('getCollection', () => {
  beforeEach(async () => {
    await resetTestDb()
    vi.clearAllMocks()
  })

  it('returns null when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    expect(await getCollection(1)).toBeNull()
  })

  it('returns null when the user has no membership on the collection', async () => {
    const me = await seedUser('me@x.com')
    const other = await seedUser('other@x.com')
    const c = await db.collection.create({ data: { name: 'Not mine', ownerId: other.id } })
    mockAuth.mockResolvedValue({ user: { id: String(me.id) } })

    expect(await getCollection(c.id)).toBeNull()
  })

  it('returns the collection with viewerRole for an operator member', async () => {
    const me = await seedUser('me@x.com')
    const c = await db.collection.create({ data: { name: 'Mine', ownerId: me.id } })
    await db.collectionMembership.create({ data: { collectionId: c.id, userId: me.id, role: 'operator' } })
    mockAuth.mockResolvedValue({ user: { id: String(me.id) } })

    const result = await getCollection(c.id)

    expect(result).toMatchObject({ id: c.id, viewerRole: 'operator' })
  })

  it('returns the collection with hero photo + viewerRole for a curator member', async () => {
    const me = await seedUser('me@x.com')
    const c = await db.collection.create({ data: { name: 'Mine', ownerId: me.id } })
    await db.collectionMembership.create({ data: { collectionId: c.id, userId: me.id, role: 'curator' } })
    const item = await db.item.create({ data: { collectionId: c.id, brand: 'Prada' } })
    await db.photo.create({
      data: {
        itemId: item.id,
        blobKey: 'k-hero',
        originalBlobKey: 'k-hero',
        isHero: true,
      },
    })
    await db.photo.create({
      data: {
        itemId: item.id,
        blobKey: 'k-other',
        originalBlobKey: 'k-other',
        isHero: false,
      },
    })
    mockAuth.mockResolvedValue({ user: { id: String(me.id) } })

    const result = await getCollection(c.id)
    expect(result?.viewerRole).toBe('curator')
    expect(result?.items[0].photos).toHaveLength(1)
    expect(result?.items[0].photos[0].isHero).toBe(true)
  })
})
