# Persisted Variant Cache — resize-once-globally (sub-project A follow-up)

**Bead:** purses-u1lr.4 · **Epic:** purses-u1lr · **Date:** 2026-06-20 · depends on A + B (merged)

## Problem
A (#219) resizes on-demand in `servePhotoFile` and caches only in the requesting **browser** (`Cache-Control: private`). So every device / incognito / cache-eviction re-runs the full pipeline: fetch the 4 MB original from Blob + `sharp` decode/orient/rotate/resize. The first paint of a grid fires N concurrent resizes (herd), and the same 640px variant is recomputed for every shared-collection member. The user-perceived first-load win shipped in A; this removes the **cross-device / cold recompute** cost.

## Solution
Persist each resized variant back to Vercel Blob under a **deterministic key**; serve it thereafter. `sharp` runs **once per (photo, width, version) ever**, not once per browser.

### 1. Variant store + get-or-create (in `servePhotoFile`)
- **Variant pathname:** `variants/<collectionId>/<photoId>/w<width>-v<version>.webp` (`version` = `updatedAt` ms — already the ETag version, so a rotation/edit that bumps `updatedAt` yields a **new** variant key; old-version variants become unreferenced).
- `servePhotoFile` gains `collectionId` in its args. In the **resize branch** (`?w=` allowlisted):
  1. `get(variantPath, { access: "private" })` — **HIT** (`statusCode 200`): stream it (`image/webp` + the same `Cache-Control`/`ETag`). No `sharp`, no original fetch.
  2. **MISS** (null): fetch the original (existing `get(blobKey)`), `sharp().rotate().rotate(rotation).resize(w).webp()` (unchanged pipeline), then `put(variantPath, buf, { access: "private", addRandomSuffix: false, contentType: "image/webp" })` (deterministic pathname → idempotent overwrite on the rare concurrent double-miss; same bytes, last-write-wins is harmless), and stream the buffer.
- **Passthrough (no `?w=`)** and the existing decode-bomb guards, ETag, `Cache-Control`, 304 short-circuit are **unchanged**. Only the resize branch gains the variant lookup.
- **webp retained** (avif is a trivial follow-on now that encode is amortized, but changes Content-Type + first-miss latency — out of scope here).

### 2. Orphan cleanup (bead scope: photo delete + collection purge)
A best-effort helper `src/lib/photo-variants.ts`:
- `variantPrefix(collectionId, photoId?)` → the pathname prefix.
- `deleteVariants(prefix)` → `list({ prefix })` then `del(blobs.map(b => b.url))`; logs a rejection, never throws (mirrors the purge services' post-commit `del`).
Wire it:
- **Photo DELETE** route (`…/items/[itemId]/photos/[photoId]` DELETE): after the original `del`, `deleteVariants(variantPrefix(params.id, params.photoId))` — removes **all** versions of that photo's variants in one prefix sweep.
- **`CollectionPurgeService`**: post-commit (alongside the original `del`), `deleteVariants(variantPrefix(collection.id))` — removes the whole collection's variants.
- **Out of scope (per bead):** item-purge variant cleanup — `ItemPurgeService` has no photoIds at hand (would need a repo return-type change); its orphaned variants are tiny webp, unreferenced (the photo row is gone), and swept if the collection is later purged. Noted, not built.

## Components / files
- `src/lib/photo-serving.ts` — `collectionId` in `ServeArgs`; variant get-or-create in the resize branch.
- both `/file` routes — pass `collectionId` (item route: `params.id`; pool route: `params.id`).
- `src/lib/photo-variants.ts` *(new)* — `variantPrefix` + `deleteVariants`.
- `…/items/[itemId]/photos/[photoId]/route.ts` (DELETE) — wire variant cleanup.
- `src/server/services/CollectionPurgeService.ts` — wire variant cleanup post-commit.

## Testing (TDD; runs in CI)
- **`servePhotoFile` (`photo-serving.test.ts`)**, mock `get`/`put` (`@vercel/blob`), real `sharp`:
  - **HIT**: `get(variantPath)` returns `{statusCode:200, stream}` → response is that stream, `put` NOT called, and the original `get(blobKey)` NOT called (proves serve-from-variant).
  - **MISS**: `get(variantPath)` null, `get(blobKey)` returns the original → `put` called once with a pathname matching `variants/<cid>/<pid>/w320-v…webp` + `contentType image/webp` + `addRandomSuffix:false`; response streams the resized bytes; decoded width ≤ w.
  - **version**: two MISSes with different `updatedAt` → `put` pathnames differ (rotation busts the variant).
  - passthrough (no `w`) → no variant `get`/`put`.
- **`photo-variants.test.ts`**: `deleteVariants` calls `list` with the prefix and `del` with the listed urls; a `del`/`list` rejection is swallowed (logged), never thrown; `variantPrefix` shape.
- **Photo DELETE route test**: variant cleanup helper invoked with `variants/<id>/<photoId>/` after a successful delete (mock the helper).
- **`CollectionPurgeService`**: extend its DB integration test (or a focused unit) asserting `deleteVariants` is invoked for the collection prefix post-commit (mock blob `list`/`del`).
- e2e: behavior unchanged (image still renders at `?w=`); variant persistence is server-internal (Blob mocked in e2e), so it stays unit-covered.

## Risks
- **Concurrent double-miss** → two `put`s to the same deterministic pathname; identical bytes, last-write-wins — harmless. (Not worth a lock.)
- **`get` by pathname** (not full URL) for the variant: `@vercel/blob get(urlOrPathname)` accepts a pathname; the variant is `put` with `addRandomSuffix:false` so the pathname is exact. Verify in impl.
- **Storage growth** from rotation-orphaned old-version variants — bounded by the prefix sweep on photo delete / collection purge; tiny webp.
- **Serving-path latency on miss** is unchanged from A (one extra `put` after the resize, off the response's critical bytes — can be fire-and-forget if needed; default await for simplicity).
