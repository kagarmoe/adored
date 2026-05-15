import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  seedDemoItems,
  ensureDemoMembership,
  DEMO_ITEMS,
  RETIRED_URLS,
  type SeedDb,
} from '../seed-demo'

function makeDb(seedExisting: { itemId: number; originalBlobKey: string }[] = []): {
  db: SeedDb
  state: {
    photos: { itemId: number; originalBlobKey: string }[]
    items: { id: number; collectionId: number; brand: string; style: string }[]
    nextItemId: number
  }
} {
  const state = {
    photos: [...seedExisting],
    items: [] as { id: number; collectionId: number; brand: string; style: string }[],
    nextItemId: 1000,
  }

  const db: SeedDb = {
    photo: {
      findUnique: vi.fn(async ({ where }) => {
        return state.photos.find(p => p.originalBlobKey === where.originalBlobKey) ?? null
      }),
      create: vi.fn(async ({ data }) => {
        state.photos.push({
          itemId: data.itemId,
          originalBlobKey: data.originalBlobKey,
        })
        return data
      }),
      update: vi.fn(async ({ where, data }) => {
        const row = state.photos.find(p => p.originalBlobKey === where.originalBlobKey)
        if (!row) throw new Error(`update: no photo with originalBlobKey=${where.originalBlobKey}`)
        row.originalBlobKey = data.originalBlobKey
        return row
      }),
    },
    item: {
      create: vi.fn(async ({ data }) => {
        const id = state.nextItemId++
        state.items.push({
          id,
          collectionId: data.collectionId,
          brand: data.brand,
          style: data.style,
        })
        return { id }
      }),
    },
  }

  return { db, state }
}

describe('seedDemoItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts every demo item on a fresh database', async () => {
    const { db, state } = makeDb()
    const result = await seedDemoItems(db, 1)
    expect(result.created).toBe(DEMO_ITEMS.length)
    expect(result.skipped).toBe(0)
    expect(state.items).toHaveLength(DEMO_ITEMS.length)
    expect(state.photos).toHaveLength(DEMO_ITEMS.length)
  })

  it('is idempotent on a fully-populated database (no duplicates)', async () => {
    const seeded = DEMO_ITEMS.map((d, i) => ({ itemId: i + 1, originalBlobKey: d.photoUrl }))
    const { db, state } = makeDb(seeded)
    const result = await seedDemoItems(db, 1)
    expect(result.created).toBe(0)
    expect(result.skipped).toBe(DEMO_ITEMS.length)
    expect(state.items).toHaveLength(0)
    expect(state.photos).toHaveLength(DEMO_ITEMS.length)
  })

  it('on a partial-failure rerun (10 of 20 already present), inserts only the missing 10 — final count is 20, not 30', async () => {
    // Half of the demo items were already inserted in a previous (partially failed) run.
    const seeded = DEMO_ITEMS.slice(0, 10).map((d, i) => ({
      itemId: i + 1,
      originalBlobKey: d.photoUrl,
    }))
    const { db, state } = makeDb(seeded)

    const result = await seedDemoItems(db, 42)

    expect(result.created).toBe(10)
    expect(result.skipped).toBe(10)
    expect(state.items).toHaveLength(10)
    // Final photo count: 10 pre-existing + 10 newly created.
    expect(state.photos).toHaveLength(20)
  })

  it('passes collectionId through to item.create', async () => {
    const { db, state } = makeDb()
    await seedDemoItems(db, 99, [DEMO_ITEMS[0]])
    expect(state.items[0].collectionId).toBe(99)
  })

  // Regression for the duplicate-row bug surfaced in PR #7 review (purses-jml).
  // When a DEMO_ITEMS photoUrl is changed (e.g. Marshmallow refresh in c951657),
  // any DB seeded under the OLD URL would miss the originalBlobKey lookup on
  // re-seed and insert a second Marshmallow row. seedDemoItems now consults
  // RETIRED_URLS and rewrites stale rows in place instead of duplicating.
  it('rewrites a row stored under a retired URL instead of inserting a duplicate', async () => {
    expect(Object.keys(RETIRED_URLS).length).toBeGreaterThan(0)
    const [retiredUrl, currentUrl] = Object.entries(RETIRED_URLS)[0]
    // The retired URL must map to a real DEMO_ITEMS entry, otherwise the
    // RETIRED_URLS map is stale.
    const retiredItem = DEMO_ITEMS.find(d => d.photoUrl === currentUrl)
    expect(retiredItem, `RETIRED_URLS target ${currentUrl} not found in DEMO_ITEMS`).toBeDefined()

    // Pre-populate the DB as if it were seeded BEFORE the URL was refreshed:
    // every other item at its current URL, this one row still under the retired URL.
    const seeded = DEMO_ITEMS.map((d, i) => ({
      itemId: i + 1,
      originalBlobKey: d.photoUrl === currentUrl ? retiredUrl : d.photoUrl,
    }))
    const { db, state } = makeDb(seeded)

    const result = await seedDemoItems(db, 1)

    expect(result.created).toBe(0)
    expect(result.skipped).toBe(DEMO_ITEMS.length)
    // No duplicate Item row.
    expect(state.items).toHaveLength(0)
    // Still 20 photos — the stale row was updated in place, not joined by a duplicate.
    expect(state.photos).toHaveLength(DEMO_ITEMS.length)
    // The stale row now points at the current URL; the retired URL is gone.
    expect(state.photos.some(p => p.originalBlobKey === currentUrl)).toBe(true)
    expect(state.photos.some(p => p.originalBlobKey === retiredUrl)).toBe(false)
  })
})

describe('ensureDemoMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an operator membership when none exists', async () => {
    const db = {
      collectionMembership: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    }
    await ensureDemoMembership(db as never, 10, 20)
    expect(db.collectionMembership.findUnique).toHaveBeenCalledWith({
      where: { collectionId_userId: { collectionId: 10, userId: 20 } },
    })
    expect(db.collectionMembership.create).toHaveBeenCalledWith({
      data: { collectionId: 10, userId: 20, role: 'operator' },
    })
  })

  it('is idempotent — skips when the membership already exists', async () => {
    const db = {
      collectionMembership: {
        findUnique: vi.fn().mockResolvedValue({ id: 1 }),
        create: vi.fn(),
      },
    }
    await ensureDemoMembership(db as never, 10, 20)
    expect(db.collectionMembership.create).not.toHaveBeenCalled()
  })
})

// HARD-JUSTIFIED OPT-IN SKIP (purses-chh.4 audit): the 20 it.each cases below
// are gated behind RUN_NETWORK_TESTS=1 because they hit the Unsplash CDN —
// an external service we do not control. Running them on every push would
//   (a) make `npm test` flaky against any Unsplash blip,
//   (b) fan 20 HEAD requests at Unsplash on every CI run, risking rate-limit,
//   (c) couple a hermetic unit-test command to a third-party uptime SLA.
// The skip is intentional, not a runner gap — there is no in-process fix that
// removes the external dependency. This block exists to catch the regression
// class where Unsplash removes a source image (see purses-13k Marshmallow
// incident); run it manually before changing DEMO_ITEMS, e.g.:
//
//   RUN_NETWORK_TESTS=1 npx vitest run prisma/__tests__/seed-demo.test.ts
//
// We use vitest's default sequential it.each (no .concurrent) so the 20
// requests fan out one at a time when opted in — slower but rate-limit-safe.
describe.skipIf(process.env.RUN_NETWORK_TESTS !== '1')(
  'DEMO_ITEMS photoUrl liveness (network)',
  () => {
    it.each(DEMO_ITEMS)(
      '$brand ($style) — $photoUrl returns 200',
      { timeout: 15_000 },
      async ({ photoUrl }) => {
        const res = await fetch(photoUrl, { method: 'HEAD', redirect: 'follow' })
        expect(res.status, `${photoUrl} returned ${res.status}`).toBe(200)
      },
    )
  },
)
