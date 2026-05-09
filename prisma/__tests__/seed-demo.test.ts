import { describe, it, expect, vi, beforeEach } from 'vitest'
import { seedDemoItems, DEMO_ITEMS, type SeedDb } from '../seed-demo'

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
})
