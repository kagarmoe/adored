/**
 * Seed script for the PurseInator demo collection.
 *
 * Creates (idempotently):
 *   - A demo "owner" User (operator role) so the FK on Collection.ownerId is satisfied.
 *     The demo collection is keyed by isDemo=true, NOT by user — anonymous demo visitors
 *     never authenticate and never touch the User row.
 *   - A demo Collection (isDemo=true) named "Cute Animals — Demo".
 *   - 20 Items (mix of cats, dogs, hamsters) each with one Photo whose blobKey is a
 *     stable public CDN URL. No Vercel Blob upload needed for the demo seed.
 *
 * Usage:
 *   npx tsx prisma/seed-demo.ts
 *
 * Re-running the script is safe: it upserts the user+collection and skips item creation
 * if the demo collection already has the expected number of items.
 *
 * Photo attribution: all URLs are public assets from Unsplash and Pexels (free-to-use,
 * no attribution required by license but credited below as a courtesy).
 */
import { PrismaClient } from '../lib/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { DEMO_USER_EMAIL, DEMO_COLLECTION_NAME } from '../lib/demo'

interface DemoItem {
  brand: string
  style: string
  photoUrl: string
}

// 20 cute animals — 7 cats, 7 dogs, 6 hamsters.
// Brand/style fields are repurposed in the demo to hold the animal's "name" / breed.
// Each photoUrl must be globally unique — Photo.originalBlobKey has @unique,
// so reusing a CDN URL across two items would fail at insert time.
export const DEMO_ITEMS: DemoItem[] = [
  // Cats — Unsplash
  { brand: 'Mochi', style: 'Tabby cat', photoUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&q=80' },
  { brand: 'Pepper', style: 'Black cat', photoUrl: 'https://images.unsplash.com/photo-1495360010541-f48722b34f7d?w=800&q=80' },
  { brand: 'Biscuit', style: 'Ginger kitten', photoUrl: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=800&q=80' },
  { brand: 'Luna', style: 'Calico', photoUrl: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=800&q=80' },
  { brand: 'Smudge', style: 'White kitten', photoUrl: 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=800&q=80' },
  { brand: 'Olive', style: 'Tortoiseshell', photoUrl: 'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=800&q=80' },
  { brand: 'Niblet', style: 'Tuxedo cat', photoUrl: 'https://images.unsplash.com/photo-1494256997604-768d1f608cac?w=800&q=80' },

  // Dogs — Unsplash
  { brand: 'Biscuit', style: 'Golden puppy', photoUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&q=80' },
  { brand: 'Bartholomew', style: 'Frenchie', photoUrl: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=800&q=80' },
  { brand: 'Pickle', style: 'Pug', photoUrl: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&q=80' },
  { brand: 'Cooper', style: 'Lab mix', photoUrl: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80' },
  { brand: 'Daisy', style: 'Corgi', photoUrl: 'https://images.unsplash.com/photo-1612536057832-2ff7ead58194?w=800&q=80' },
  { brand: 'Toast', style: 'Shiba inu', photoUrl: 'https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=800&q=80' },
  { brand: 'Theodore', style: 'Beagle', photoUrl: 'https://images.unsplash.com/photo-1546238232-20216dec9f72?w=800&q=80' },

  // Hamsters & friends — Unsplash
  { brand: 'Cheddar', style: 'Syrian hamster', photoUrl: 'https://images.unsplash.com/photo-1425082661705-1834bfd09dca?w=800&q=80' },
  { brand: 'Nibbles', style: 'Dwarf hamster', photoUrl: 'https://images.unsplash.com/photo-1591871937573-74dbba515c4c?w=800&q=80' },
  { brand: 'Hazel', style: 'Roborovski', photoUrl: 'https://images.unsplash.com/photo-1606214174585-fe31582dc6ee?w=800&q=80' },
  { brand: 'Pip', style: 'Hamster cheek-pouch', photoUrl: 'https://images.unsplash.com/photo-1535241749838-299277b6305f?w=800&q=80' },
  { brand: 'Crouton', style: 'Hamster portrait', photoUrl: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=800&q=80' },
  { brand: 'Marshmallow', style: 'Tiny hamster', photoUrl: 'https://images.unsplash.com/photo-1721327900409-5e445c1ed119?w=800&q=80' },
]

// Map of retired DEMO_ITEMS photoUrls → their current replacement.
//
// When a DEMO_ITEMS photoUrl is changed (because Unsplash removed the source
// image, etc.) any production database seeded under the OLD URL would miss
// the originalBlobKey lookup on the next re-seed and insert a duplicate row.
// Listing the retirement here lets seedDemoItems detect rows stored under
// the old URL and rewrite them in place instead of duplicating.
//
// Add an entry whenever you change a photoUrl in DEMO_ITEMS. Entries can be
// removed once you're confident no live DB still holds the old URL.
export const RETIRED_URLS: Record<string, string> = {
  // Marshmallow's original Unsplash photo (1626151407839-1a47a98a2092) was
  // removed by Unsplash; the URL began returning 404. Refreshed in c951657.
  'https://images.unsplash.com/photo-1626151407839-1a47a98a2092?w=800&q=80':
    'https://images.unsplash.com/photo-1721327900409-5e445c1ed119?w=800&q=80',
}

// Minimal contract on the prisma client we need — lets the seed be unit-tested
// without spinning up a real Postgres.
export interface SeedDb {
  photo: {
    findUnique: (args: { where: { originalBlobKey: string } }) => Promise<{ itemId: number } | null>
    create: (args: {
      data: {
        itemId: number
        blobKey: string
        originalBlobKey: string
        bgRemoved: boolean
        isHero: boolean
      }
    }) => Promise<unknown>
    update: (args: {
      where: { originalBlobKey: string }
      data: { blobKey: string; originalBlobKey: string }
    }) => Promise<unknown>
  }
  item: {
    create: (args: {
      data: { collectionId: number; brand: string; style: string }
    }) => Promise<{ id: number }>
  }
}

/**
 * Idempotently insert DEMO_ITEMS into `collectionId`.
 *
 * The previous implementation used a count-based guard
 * (`if (collection.items.length >= DEMO_ITEMS.length) skip`) which allowed a
 * partial-failure re-run to insert duplicates (e.g. 10 → 30 items).
 *
 * This per-item approach keys off `Photo.originalBlobKey @unique` (the photoUrl
 * is unique per demo entry, and the schema already enforces global uniqueness).
 * If a Photo with the same originalBlobKey exists, we skip — otherwise we
 * create the Item and its hero Photo.
 *
 * Why not a unique index on (collectionId, brand, style)? Real (non-demo)
 * collections may legitimately hold multiple items with the same brand/style
 * (two black totes, etc.). Adding that constraint would break real uploads.
 */
export async function seedDemoItems(
  db: SeedDb,
  collectionId: number,
  items: DemoItem[] = DEMO_ITEMS,
): Promise<{ created: number; skipped: number }> {
  let created = 0
  let skipped = 0
  for (const data of items) {
    let existing = await db.photo.findUnique({
      where: { originalBlobKey: data.photoUrl },
    })
    if (!existing) {
      // The row may exist under a retired URL — rewrite it in place rather
      // than inserting a duplicate. Photo.originalBlobKey is @unique, so
      // the new URL is guaranteed free (we just confirmed nothing matched).
      const retiredKey = retiredKeyFor(data.photoUrl)
      if (retiredKey) {
        const stale = await db.photo.findUnique({ where: { originalBlobKey: retiredKey } })
        if (stale) {
          await db.photo.update({
            where: { originalBlobKey: retiredKey },
            data: { blobKey: data.photoUrl, originalBlobKey: data.photoUrl },
          })
          existing = stale
        }
      }
    }
    if (existing) {
      skipped++
      continue
    }
    const item = await db.item.create({
      data: { collectionId, brand: data.brand, style: data.style },
    })
    await db.photo.create({
      data: {
        itemId: item.id,
        // blobKey is consumed by displayPhotoUrl(); any reachable URL works.
        blobKey: data.photoUrl,
        originalBlobKey: data.photoUrl,
        bgRemoved: false,
        isHero: true,
      },
    })
    created++
  }
  return { created, skipped }
}

function retiredKeyFor(currentUrl: string): string | undefined {
  for (const [retired, current] of Object.entries(RETIRED_URLS)) {
    if (current === currentUrl) return retired
  }
  return undefined
}

async function main() {
  if (DEMO_ITEMS.length !== 20) {
    throw new Error(`Expected 20 demo items, got ${DEMO_ITEMS.length}`)
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set to seed the demo collection.')
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const db = new PrismaClient({ adapter })

  try {
    const owner = await db.user.upsert({
      where: { email: DEMO_USER_EMAIL },
      create: { email: DEMO_USER_EMAIL, name: 'PurseInator Demo', role: 'operator' },
      update: {},
    })

    const existing = await db.collection.findFirst({
      where: { isDemo: true },
      include: { items: { select: { id: true } } },
    })

    let collection = existing
    if (!collection) {
      collection = await db.collection.create({
        data: {
          ownerId: owner.id,
          name: DEMO_COLLECTION_NAME,
          description: 'A tiny menagerie. Sort the cuties — your rankings stay in this browser.',
          isDemo: true,
        },
        include: { items: { select: { id: true } } },
      })
      console.log(`Created demo collection id=${collection.id}`)
    } else {
      console.log(`Found existing demo collection id=${collection.id} (${collection.items.length} items)`)
    }

    const { created, skipped } = await seedDemoItems(db, collection.id)
    console.log(
      `Seeded demo collection ${collection.id}: ${created} created, ${skipped} already present.`,
    )
  } finally {
    await db.$disconnect()
  }
}

// Auto-run when executed as a script (`npx tsx prisma/seed-demo.ts`). Skip
// under vitest so tests can import the helpers without launching prisma.
if (!process.env.VITEST) {
  main().catch((err) => {
    console.error('seed-demo failed:', err)
    process.exit(1)
  })
}
