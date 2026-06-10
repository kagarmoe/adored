# Bulk Upload → Photo Pool → Grouped Items — Design Spec

**Date:** 2026-06-10
**Issue:** purses-b1k (bulk image upload — upload-first, defer metadata). Enabled by PR #83
(wireframes are reference, not law). Governed by [`TONE.md`](../../TONE.md) and
[`PRODUCT.md`](../../PRODUCT.md).

## Goal

Let a person **dump many images into a collection fast, with no metadata gate**, then **group**
those photos into items at their own pace, filling in details later or never. Items get a clean
**per-collection catalog number** that is their URL. The driving need: getting photos in quickly is
the urgent real-world task; the current "create item (name required) → then upload a photo" order
blocks it.

## The model

```
Bulk upload N images ─▶ durable per-collection POOL (unassigned photos)
                              │
                        group selected photos ─▶ ITEM (one object, 1..n photos)
                              │                    └ per-collection catalog number = its URL
                        metadata deferred (name, dimensions, weight, …) — later or never
```

- A photo is a **durable DB row + Blob object from the moment it uploads** — not transient client
  state. A crash leaves uploaded photos safely in the pool.
- An item may hold **several photos** (front / back / detail of one object).
- An item needs **no metadata** to exist: `name` and all descriptive fields are optional. A
  photo-only item is identified by its photo and its catalog number.

## Schema changes (one migration)

All additive or constraint-relaxing. Existing dev data is disposable (owner confirmed) — **no
backfill**; reset rows if convenient.

**`items`:**

- `name`: `NOT NULL` → **nullable** (demotes name to "one more optional field"; the table already
  has `brand/style/color/material/category/notes` nullable).
- add `number` `integer` — the per-collection catalog number.
- add `height` `width` `depth` `weight`: `numeric` (decimal), nullable.
- add `unit` `text` default `'imperial'` (US default: dimensions in inches, weight in pounds;
  `'metric'` = cm + kg). One system-toggle field, not a unit per measure.
- add `UNIQUE (collection_id, number)` constraint + keep `items_collection_id_idx`.

**`photos`:**

- `itemId`: `NOT NULL` → **nullable** (a pooled photo has no item yet).
- add `collectionId` `text` `NOT NULL` references `collections(id)` — so a pooled photo is still
  anchored to its collection. Index it (`photos_collection_id_idx`).
- Pool = `photos WHERE item_id IS NULL` for a collection. Assigned = `item_id` set.

The internal **ULID primary keys stay** (`items.id` = `item_<ulid>`, `photos.id` = `photo_<ulid>`,
via `generateId()`). A ULID is 128-bit, collision-proof, and lexicographically time-sortable — there
is **no name in it**, so name collisions are structurally impossible; this is *not* a name-derived
slug. The catalog `number` is a *secondary* per-collection identifier used only for URLs and display
— `photos.itemId`, preference ids, and all FKs keep referencing the stable ULIDs.

## The durable pool (Blob client upload)

Per `vercel:vercel-storage`: switch the bulk path to **Blob client upload** (`@vercel/blob/client`
`upload()` + a `handleUploadUrl` token endpoint). This sends bytes **straight to Blob** (no 4.5 MB
serverless body limit — the cap behind today's `uploads.ts` server-side `put`), scaling to hundreds
of images.

**Crash-safe seam:** Blob owns durability of the *file*; the **`onUploadCompleted` callback** is the
one atomic server step that writes the `photos` row (`id`, `collectionId`, `itemId = NULL`,
`blobKey`, `filename`, `mimeType`, `uploadedBy`). File-confirmed-then-row means the two can never
get out of sync, and the pool is always recoverable from the DB. Orphan-blob sweep (rare) is a
follow-up nicety, not required.

HEIC handling (`src/lib/uploads.ts`) and the per-file size/type validation carry over, applied in
the token-grant / completion path.

## Catalog numbers + URL routing

- The item URL becomes `/collections/{collectionId}/items/{number}` — e.g. `…/items/3`, not the text
  id or a name slug. (A nameless item can't have a name slug, so the number is also what makes
  nameless items addressable.)
- Resolve an item by `(collectionId, number)`.
- **Allocation:** next number = `MAX(number) + 1` within the collection; the `UNIQUE(collection_id,
  number)` constraint catches the rare race (neon-http is stateless — no long transactions), retry
  on conflict.
- **Route refactor (mechanical):** the `[itemId]` route segments, item links, and item API paths
  move from the text id to the collection-scoped number. This is the larger code change.

## Grouping into items

- The collection has a **pool view** of its unassigned photos.
- Select one or more pooled photos → **"Make an item"** → creates an item (next catalog number,
  no metadata), sets those photos' `itemId`, marks one `isHero`.
- Reassign / regroup later (move a photo between items, split, merge).
- Tap-first, ≥44px, no swiping (drag permitted where it genuinely helps, per the interaction
  principles).

## Deferred metadata

- Items with no name/details are first-class. Surfacing "items that could use details" is **gentle
  and optional** — never "N incomplete" shaming (TONE commitment 4: unpressured and forgiving). A
  quiet filter or marker, not a nag.
- Metadata editing (name, dimensions, weight, unit, the existing fields) is the same edit form,
  reachable anytime.

## Migration mechanics (Neon)

- Edit `schema.ts` → `npm run db:generate` → run the migration.
- `drizzle-kit`/`tsx` **do not auto-load `.env.local`** — run via `npx dotenv -e .env.local -- …`
  or source env (see `neon-db-setup` memory).
- Apply to **both Neon branches** (dev + prod) — not live until both are migrated; apply to the e2e
  schema too.
- No backfill (disposable data).

## TONE / PRODUCT alignment

- **Unpressured (commitment 4):** no metadata gate; defer freely; no completion shaming.
- **One thing at a time:** don't make someone name 100 objects to upload 100 photos.
- **Object-first / not inventory:** the photo is the item's identity; catalog numbers are quiet
  handles, not a SKU catalog framing.
- The new upload/pool/grouping UI uses the **luminous design system** (merged) — new tokens, both
  themes, AA.

## Phasing (one spec, phased build)

1. **Foundation:** the migration + catalog-number URL refactor (data layer correct first).
2. **Get photos in:** durable Blob-client bulk upload → pool + a pool view (delivers the urgent
   "dump 100 photos" capability end-to-end).
3. **Grouping + deferred metadata:** pool → group into numbered items; gentle "needs details"
   surfacing.

## Scope

**In scope:** the schema migration, Blob-client bulk upload to a durable pool, catalog numbers +
item-URL refactor, the pool + grouping UI, deferred metadata, collection-scoped upload.

**Out of scope / future:** a top-level "upload then pick a collection" entry (collection-scoped
only for now); the **storage-capacity "what fits" feature** that the dimensions/weight fields enable
(future — the metadata is captured now so it's ready); orphan-blob sweeping; bulk *metadata* editing.

## Resolved decisions

- Each uploaded photo is a durable row immediately (crash-safe) — not a temp/in-memory staging.
- Catalog `number` is a per-collection secondary id for URLs; internal PKs stay **ULIDs**
  (`<prefix>_<ulid>`) — collision-proof and time-sortable, not name-derived.
- `name` nullable (truly nameless items, photo as identity) — not auto-placeholder.
- Units: one `unit` field, default `imperial`.
- No backfill (disposable existing data).
- Collection-scoped bulk upload.
