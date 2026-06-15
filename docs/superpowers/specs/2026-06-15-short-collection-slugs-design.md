# Design: Short, meaningful collection slugs in page URLs

**Bead:** `purses-9fi`
**Date:** 2026-06-15
**Status:** Approved (brainstorming) → ready for implementation plan

## Problem

Collection-scoped page URLs expose the raw 26-char ULID primary key:

```
/collections/coll_01kt2ezyqbn6p1bd3htb6rvnrg/items/6
```

We want a short, human-meaningful identifier in user-facing URLs:

```
/collections/coll_summer-bags/items/6
```

## Decisions (settled during brainstorming)

| # | Decision | Rationale |
|---|----------|-----------|
| Scheme | **`coll_` + slugified collection name** (`coll_summer-bags`) | Meaningful to the user; globally unique with a dedupe suffix; viewer-independent so shared-collection links keep working. |
| Uniqueness | **Global**, via numeric dedupe suffix (`coll_summer-bags-2`, `-3`) excluding the collection's own row | A URL identifier must resolve the same collection for every viewer. Per-owner numbers (`coll_1`) are not globally unique and break shared links. |
| Empty-name fallback | If the name slugifies to empty (emoji/non-Latin only), use `coll_` + 6 random Crockford-base32 chars | Guarantees a valid, unique slug always exists. |
| Rename | **Regenerate the slug on rename** | Slug always mirrors the current name. The **immutable ULID remains the permanent link** (resolver still accepts it); a stale slug falls through to the same "not found → /collections" path as any unknown id. Chosen over stable-at-creation knowingly. |
| Scope | **Page routes only.** API routes and client `fetch` calls stay on the ULID. | API URLs are never user-visible. There is no shared API access-guard to hang slug resolution on (23 hand-rolled handlers, some without membership checks); slugging them would be invasive, risky, and valueless. |
| Old URLs | **Keep working**, no redirect. The resolver accepts slug **or** ULID. | Zero breakage for existing bookmarks/links. A canonical 301 (ULID→slug) is explicitly out of scope (YAGNI). |

## The one rule that prevents bugs

> **The URL slug is used *only* to look up the collection at the page boundary. Nothing downstream ever sees it — all data access (API URLs, image URLs, props passed to client components) uses `collection.id` (the immutable ULID).**

Navigation links (`href` to other pages) use `collection.slug ?? collection.id` so the address bar stays canonical. This split (public routing identifier vs. internal data key) also means a rename mid-session can never break an in-flight API call, because the API never sees the mutable slug.

## Architecture

### 1. Data model — `src/lib/db/schema.ts`

Add to `collectionsTable`:

```ts
slug: text("slug"),
// + uniqueIndex("collections_slug_unique").on(table.slug)
```

Nullable in the column type; non-null by construction (generated on create, on rename, and backfilled). The resolver and link-building both defend against a null slug by falling back to `id`.

### 2. Migration + backfill

1. `npm run db:generate` produces the `ALTER TABLE … ADD COLUMN slug` + unique index migration in `drizzle/`.
2. **Backfill** existing rows via a one-off, idempotent Node script (`scripts/backfill-collection-slugs.ts`) that reuses the same slug helper as runtime — single source of truth for slugify + dedupe rather than duplicating the logic in SQL. Run after the schema migration, before relying on the column.

### 3. Slug helper — `src/lib/collections/slug.ts` (new)

- `slugifyName(name: string): string` — lowercase; replace runs of non-`[a-z0-9]` with `-`; collapse repeats; trim leading/trailing `-`; truncate to ~40 chars.
- `generateUniqueCollectionSlug(db, name, excludeId?): Promise<string>` — base = `coll_` + (`slugifyName(name)` or random Crockford-base32 fallback); probe for the first free value among `base`, `base-2`, `base-3`, … excluding `excludeId`; return it.
- The `UNIQUE` index is the race backstop: insert/update retries on unique violation (the proven `ItemRepository` MAX+1 retry pattern).

### 4. Repository — `src/server/repositories/implementations/CollectionRepository.ts`

- `create()` — generate a unique slug from the name; insert; retry on unique-violation (≤5).
- `update()` — when `name` changes, regenerate the slug (dedupe **excluding self**); retry on conflict.
- `findBySlug(slug): Promise<Collection | null>` — new.
- `mapToCollection` includes `slug`.

### 5. Resolver — `src/lib/collection-access.ts`

```ts
resolveCollection(db, slugOrId, userId): Promise<Collection | null>
// findBySlug(slugOrId) ?? findById(slugOrId), then member-or-owner check
```

`requireCollectionAccess` is refactored to delegate to `resolveCollection`, preserving its redirect-on-miss / redirect-on-no-access behavior. Slug (~`coll_`+name) and ULID (`coll_`+26) never collide — separate columns, distinct shapes.

### 6. Type — `src/types`

`Collection` gains `slug: string | null`.

### 7. Page-layer audit (the careful part)

On every collection-scoped page, each use of `params.id` falls into exactly one bucket:

- **Resolve the collection** (`requireCollectionAccess`) → keep (accepts slug or ULID).
- **Build a data/image URL or pass to a client component** → **must become `collection.id`.** Known sites: `ItemDetailPage` hero + gallery (`getPhotoAssetUrlForPhoto(photo, params.id)` → `collection.id`); the photos page (`PhotoGallery` `collectionId` prop); the pool page (`PoolUpload`, `PoolPhotoGrid` `collectionId` props). Grep for `getPhotoAssetUrlForPhoto`, `getPoolPhotoAssetUrl`, and `collectionId=` on these pages.
- **Build a navigation `href`** → `collection.slug ?? collection.id` where the object is in scope (canonical address bar); keeping `params.id` also resolves correctly but isn't canonical.

Link sites that build URLs from a `collection` **object** (e.g. `CollectionCard`) switch to `collection.slug ?? collection.id`.

## Testing (per CLAUDE.md DB-test rules)

- **Unit** (`slug.test.ts`, no DB): `slugifyName` over normal names, punctuation, unicode/emoji → empty, length cap.
- **DB-backed** (`src/lib/db/collection-slug.integration.test.ts`, behind `RUN_DB_TESTS=1`, runs in the CI `db-tests` job, crosses repository→real DB un-mocked):
  - two collections with the same name → `coll_x` and `coll_x-2`.
  - rename regenerates the slug; **old slug no longer resolves, new slug + ULID both do**.
  - `resolveCollection` returns the collection by **slug** and by **ULID**; returns null for a non-member (IDOR guard — the acceptance criterion).
  - empty-slugifiable name → a unique random-fallback slug is present.

## Out of scope

- API routes and client `fetch` sites (stay on the ULID).
- Item `[itemNumber]` URLs (unchanged).
- Canonical ULID→slug 301 redirect; slug-history / old-slug redirects.

## Acceptance criteria (from the bead)

Collection-scoped page URLs use a short slug instead of the full ULID; existing collections resolve via the slug; deep links and breadcrumbs use the slug; old ULID links still resolve; no IDOR regression in `requireCollectionAccess`.
