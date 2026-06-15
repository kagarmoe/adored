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

**Soft-delete semantics (mirror items).** `collectionsTable` uses `deletedAt` soft-delete, and the `collections_slug_unique` index spans **all** rows including soft-deleted ones — exactly like `items_collection_number_unique` spans soft-deleted items. Consequences the implementation must honor:
- The dedupe probe in `generateUniqueCollectionSlug` checks availability across **all** rows (incl. `deletedAt IS NOT NULL`), so it can never propose a slug the index will reject.
- `findBySlug` filters `deletedAt IS NULL` — a soft-deleted collection cannot be resolved by slug (consistent with `findById`).
- A soft-deleted collection keeps holding its slug; reclaiming deleted slugs is out of scope.
- Postgres treats each `NULL` as distinct, so the many `NULL` slugs during the backfill window do not conflict. This is relied upon; do not change the column to `NOT NULL DEFAULT`.

### 2. Migration + backfill

1. `npm run db:generate` produces the `ALTER TABLE … ADD COLUMN slug` + unique index migration in `drizzle/`.
2. **Backfill** existing rows via a one-off, idempotent Node script (`scripts/backfill-collection-slugs.ts`) that reuses the same slug helper as runtime — single source of truth for slugify + dedupe rather than duplicating the logic in SQL.
   - The script **filters `WHERE slug IS NULL`** so it is safe to re-run and never overwrites a slug already assigned by the updated `create()` path.
   - It is safe to run against a live app: rows created after the deploy already have slugs (skipped by the filter); rows created before get one. No maintenance window required.

### 3. Slug helper — `src/lib/collections/slug.ts` (new)

- `slugifyName(name: string): string` — lowercase; replace runs of non-`[a-z0-9]` with `-`; collapse repeats; trim leading/trailing `-`; truncate to ~40 chars.
- `generateUniqueCollectionSlug(db, name, excludeId?): Promise<string>` — base = `coll_` + (`slugifyName(name)` or random Crockford-base32 fallback); probe for the first free value among `base`, `base-2`, `base-3`, …, scanning **all** rows (incl. soft-deleted) and excluding `excludeId` (the row being renamed, so a no-op rename doesn't bump itself). Return the first free value.
- The `UNIQUE` index is the race backstop: insert/update retries on unique violation (the proven `ItemRepository` MAX+1 retry pattern). The retry **matches the `collections_slug_unique` constraint name specifically** (mirror `isCatalogNumberConflict`) so it never masks an unrelated unique violation.

### 4. Repository — `src/server/repositories/implementations/CollectionRepository.ts`

- `create()` — generate a unique slug from the name; insert; retry on `collections_slug_unique` violation (≤5).
- `update()` — when `name` changes, regenerate the slug (dedupe **excluding self**); retry on conflict. **Return the updated row including the new `slug`** — the `PATCH` API response carries it (see §8).
- `findBySlug(slug): Promise<Collection | null>` — new; filters `deletedAt IS NULL`.
- `mapToCollection` includes `slug` (map `row.slug ?? null` so the runtime value matches the `string | null` type even before backfill).

### 5. Resolver — `src/lib/collection-access.ts`

```ts
resolveCollection(db, slugOrId, userId): Promise<Collection | null>
// findBySlug(slugOrId) ?? findById(slugOrId), then member-or-owner check
```

`requireCollectionAccess` delegates to `resolveCollection`, preserving its redirect-on-miss / redirect-on-no-access behavior **exactly** (no IDOR regression — the member-or-owner check is unchanged). Its parameter is renamed `collectionId → slugOrId` in the signature + doc comment to reflect that every call site now passes a slug-or-ULID. Disambiguation is purely at the DB-column level (try `slug` column, fall through to `id` column) — never string-shape parsing — so a slug that happens to look ULID-shaped still resolves correctly.

### 6. Type — `src/types`

`Collection` gains `slug: string | null`. Link-building uses `collection.slug ?? collection.id`, so a null slug is always safe.

### 7. Page-layer audit (the careful part — the largest source of risk)

**Default assumption: every `params.id` downstream is WRONG unless it is one of two things.** On every collection-scoped page, each `params.id` use falls into exactly one bucket:

| Bucket | Action |
|---|---|
| **(a)** Passed to `requireCollectionAccess` to resolve the collection | **Keep** — accepts slug or ULID. |
| **(b)** A navigation `href` to another page (where the object is in scope) | Use `collection.slug ?? collection.id` for a canonical address bar. (Bare `params.id` still resolves, but isn't canonical.) |
| **(c)** *Anything else* — a DB query, an image/file URL, a client-component prop used in `fetch`, a redirect target, or an integrity comparison | **MUST become `collection.id`** (the immutable ULID). |

Bucket (c) is far larger than the original draft implied. The categories the implementation **must** cover — each silently broken otherwise:
- **DB queries against ULID FK columns** — `findByCollection(params.id)`, `findByCollectionAndNumber(params.id, …)`, `findPoolByCollection(params.id)`, etc. These **return empty / null with no error** (the most dangerous failure mode — pages look "empty," not broken).
- **Integrity guards** — `result.collectionId !== params.id` in `results/[resultId]/page.tsx` and `finalize/page.tsx` becomes *always true* with a slug → redirect-loop out. Compare to `collection.id`.
- **Client-component props used in API/image `fetch`** — `ItemForm`, `ItemEditForm`, `PhotoUpload`, `PhotoGallery`, `StartSessionForm`, `FinalizeResultForm`, `PoolUpload`, `PoolPhotoGrid`, and `getPhotoAssetUrlForPhoto(...)` / `getPoolPhotoAssetUrl(...)` calls.
- **Redirect targets** that feed back into data access.

**Dual-use prop caveat:** some components (`ItemCard`, `MostLovedHero`, `ItemFilters`) take a single `collectionId` prop used for *navigation hrefs*. Passing them `collection.id` yields ULID-based nav links (functional but non-canonical); passing the slug keeps links pretty but is only safe because those components don't use the prop for API calls. The plan must decide per-component; the simplest correct rule is: **pass `collection.slug ?? collection.id` to nav-only components, `collection.id` to any component that fetches.**

**The complete, file:line audit (≈60 sites across 19 files) is the implementation checklist — see the appendix table at the end of this spec.** The plan executes against that table, not this prose summary.

### 8. Rename redirect contract

After an edit-mode save, `src/features/collections/CollectionForm.tsx` redirects with `router.push`. Today it pushes `/collections/${collection.id}` (ULID) — which still resolves, but leaves the address bar non-canonical immediately after a rename. Fix: `PATCH /api/collections/:id` returns the updated collection **including the new `slug`**, and `CollectionForm` redirects to `/collections/${updated.slug ?? updated.id}`. (This is the one API-response change; the API still *accepts* the ULID in its path — scope unchanged.)

## Testing (per CLAUDE.md DB-test rules)

- **Unit** (`slug.test.ts`, no DB): `slugifyName` over normal names, punctuation, unicode/emoji → empty, length cap.
- **DB-backed** (`src/lib/db/collection-slug.integration.test.ts`, behind `RUN_DB_TESTS=1`, runs in the CI `db-tests` job, crosses repository→real DB un-mocked):
  - two collections with the same name → `coll_x` and `coll_x-2`.
  - rename regenerates the slug; **old slug no longer resolves, new slug + ULID both do**.
  - `resolveCollection` returns the collection by **slug** and by **ULID**; returns null for a non-member (IDOR guard — the acceptance criterion).
  - soft-deleted collection is **not** found by `findBySlug`, but its slug is still **not** reclaimable by a new collection (unique index spans deleted rows).
  - empty-slugifiable name → a unique random-fallback slug is present.
  - **un-mocked layer crossing:** at least one test resolves a collection by slug and then fetches its items through the real repository (`findByCollection(collection.id)`) returning the right rows — guards against the bucket-(c) "slug into a FK query returns empty" failure mode that unit tests can't catch.

## Out of scope

- API routes and client `fetch` sites (stay on the ULID).
- Item `[itemNumber]` URLs (unchanged).
- Canonical ULID→slug 301 redirect; slug-history / old-slug redirects.

## Acceptance criteria (from the bead)

Collection-scoped page URLs use a short slug instead of the full ULID; existing collections resolve via the slug; deep links and breadcrumbs use the slug; old ULID links still resolve; no IDOR regression in `requireCollectionAccess`.

## Appendix: page-layer audit — implementation checklist

Every `params.id` site under `src/app/collections/[id]/**` that must change, from the senior-dev review. Line numbers are at spec time; re-grep before editing. **Category** maps to §7 buckets: **(c) data query / image-URL / API-prop / integrity guard / redirect → `collection.id`**; **(b) nav href → `collection.slug ?? collection.id`**.

| File | Line(s) | Current use | Fix → | Category |
|---|---|---|---|---|
| `[id]/page.tsx` | 28–30 | `findByCollection(params.id)` ×3 | `collection.id` | (c) DB query |
| `[id]/items/page.tsx` | 30 | `findByCollection(params.id)` | `collection.id` | (c) DB query |
| `[id]/items/page.tsx` | 92 | `getPhotoAssetUrlForPhoto(cover, params.id)` | `collection.id` | (c) image URL |
| `[id]/items/page.tsx` | 71, 91 | `ItemFilters` / `ItemCard collectionId={params.id}` | `collection.slug ?? collection.id` | (b) nav prop |
| `[id]/items/page.tsx` | 62, 65, 79 | `href=/collections/${params.id}/...` | `collection.slug ?? collection.id` | (b) nav href |
| `[id]/items/new/page.tsx` | 32 | `ItemForm collectionId={params.id}` (POST) | `collection.id` | (c) API prop |
| `[id]/items/new/page.tsx` | 25–26 | breadcrumb hrefs | `collection.slug ?? collection.id` | (b) nav href |
| `[id]/items/[itemNumber]/page.tsx` | 33 | `findByCollectionAndNumber(params.id, …)` | `collection.id` | **(c) DB query — BLOCKING** |
| `[id]/items/[itemNumber]/page.tsx` | 75, 112 | `getPhotoAssetUrlForPhoto(photo, params.id)` | `collection.id` | (c) image URL |
| `[id]/items/[itemNumber]/page.tsx` | 37,47–48,59,66,88,126,138 | nav/redirect hrefs | `collection.id` (redirect) / slug (nav) | (b)/(c) mixed |
| `[id]/items/[itemNumber]/edit/page.tsx` | 26 | `findByCollectionAndNumber(params.id, …)` | `collection.id` | **(c) DB query — BLOCKING** |
| `[id]/items/[itemNumber]/edit/page.tsx` | 49 | `ItemEditForm collectionId={params.id}` (PATCH) | `collection.id` | (c) API prop |
| `[id]/items/[itemNumber]/edit/page.tsx` | 30, 37–39 | redirect + breadcrumb | `collection.id` / slug | (b)/(c) mixed |
| `[id]/items/[itemNumber]/photos/page.tsx` | 31 | `findByCollectionAndNumber(params.id, …)` | `collection.id` | **(c) DB query — BLOCKING** |
| `[id]/items/[itemNumber]/photos/page.tsx` | 35, 40 | redirect + `findByCollection(params.id)` | `collection.id` | (c) DB query |
| `[id]/items/[itemNumber]/photos/page.tsx` | 64, 74 | `PhotoUpload` / `PhotoGallery collectionId={params.id}` | `collection.id` | (c) API prop |
| `[id]/items/[itemNumber]/photos/page.tsx` | 49–51 | breadcrumb hrefs | `collection.slug ?? collection.id` | (b) nav href |
| `[id]/pool/page.tsx` | 23 | `findPoolByCollection(params.id)` | `collection.id` | (c) DB query |
| `[id]/pool/page.tsx` | 41, 50 | `PoolUpload` / `PoolPhotoGrid collectionId={params.id}` | `collection.id` | (c) API prop |
| `[id]/pool/page.tsx` | 29 | breadcrumb href | `collection.slug ?? collection.id` | (b) nav href |
| `[id]/members/page.tsx` | 25 | `findByCollection(params.id)` | `collection.id` | (c) DB query |
| `[id]/sort/page.tsx` | 24 | `findByCollection(params.id)` | `collection.id` | (c) DB query |
| `[id]/sort/page.tsx` | 31,38,56,59,73,79 | breadcrumb + link hrefs | `collection.slug ?? collection.id` | (b) nav href |
| `[id]/sort/new/page.tsx` | 35 | `StartSessionForm collectionId={params.id}` (POST) | `collection.id` | (c) API prop |
| `[id]/sort/new/page.tsx` | 25–26 | breadcrumb hrefs | `collection.slug ?? collection.id` | (b) nav href |
| `[id]/sort/[sessionId]/page.tsx` | 31, 40 | `findByCollection(params.id)` ×2 | `collection.id` | (c) DB query |
| `[id]/sort/[sessionId]/page.tsx` | 36,59–60,110,119,139 | redirect + hrefs | `collection.id` / slug | (b)/(c) mixed |
| `[id]/sort/[sessionId]/compare/page.tsx` | 31, 33 | `findByCollection(params.id)` ×2 | `collection.id` | (c) DB query |
| `[id]/sort/[sessionId]/compare/page.tsx` | 38,46–47,79–80,99–100 | redirect + hrefs | `collection.id` / slug | (b)/(c) mixed |
| `[id]/sort/[sessionId]/triage/page.tsx` | 29, 31 | `findByCollection(params.id)` ×2 | `collection.id` | (c) DB query |
| `[id]/sort/[sessionId]/triage/page.tsx` | 35,47–48,73 | redirect + hrefs + `ItemCard` | `collection.id` / slug | (b)/(c) mixed |
| `[id]/results/page.tsx` | 24 | `findByCollection(params.id)` | `collection.id` | (c) DB query |
| `[id]/results/page.tsx` | 30, 48 | breadcrumb + result href | `collection.slug ?? collection.id` | (b) nav href |
| `[id]/results/[resultId]/page.tsx` | 50 | `findByCollection(params.id)` | `collection.id` | (c) DB query |
| `[id]/results/[resultId]/page.tsx` | 54 | `result.collectionId !== params.id` | `!== collection.id` | **(c) integrity guard — BLOCKING** |
| `[id]/results/[resultId]/page.tsx` | 55,70–71,84,111,120 | redirect + hrefs + `MostLovedHero`/`ItemCard` | `collection.id` / slug | (b)/(c) mixed |
| `[id]/results/[resultId]/finalize/page.tsx` | 24 | `result.collectionId !== params.id` | `!== collection.id` | **(c) integrity guard — BLOCKING** |
| `[id]/results/[resultId]/finalize/page.tsx` | 25,32–33,42 | redirect + hrefs + `FinalizeResultForm` | `collection.id` / slug | (b)/(c) mixed |
| `features/collections/CollectionCard.tsx` | 13 | `href=/collections/${collection.id}` | `collection.slug ?? collection.id` | (b) nav href |

**Verification step (required before "done"):** after editing, grep `src/app/collections/[id]` for `params.id` and confirm every remaining occurrence is bucket (a) `requireCollectionAccess` or a deliberate bucket (b) nav href — zero bucket (c) leaks.
