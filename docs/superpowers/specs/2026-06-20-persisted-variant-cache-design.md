# Persisted Variant Cache — resize-once-globally (sub-project A follow-up)

**Bead:** purses-u1lr.4 · **Epic:** purses-u1lr · **Date:** 2026-06-20 · depends on A + B (merged)

## Problem
A (#219) resizes on-demand in `servePhotoFile` and caches only in the requesting **browser** (`Cache-Control: private`). So every device / incognito / cache-eviction re-runs the full pipeline: fetch the 4 MB original from Blob + `sharp` decode/orient/rotate/resize. The first paint of a grid fires N concurrent resizes (herd), and the same 640px variant is recomputed for every shared-collection member. The user-perceived first-load win shipped in A; this removes the **cross-device / cold recompute** cost.

## Solution
Persist each resized variant back to Vercel Blob under a **deterministic key**; serve it thereafter. `sharp` runs **once per (photo, width, version) ever**, not once per browser.

### 1. Variant store + get-or-create (in `servePhotoFile`)
- **Variant pathname:** `variants/<collectionId>/<photoId>/w<width>-v<version>.webp` (`version` = `updatedAt` ms — already the ETag version, so a rotation/edit that bumps `updatedAt` yields a **new** variant key; old-version variants become unreferenced).
- `servePhotoFile` gains `collectionId` in its args. In the **resize branch** (`?w=` allowlisted) the variant store is **best-effort — its failure degrades to A's on-the-fly resize, never a 500/broken image**:
  1. **HIT:** `try { v = await get(variantPath, { access: "private" }) } catch { v = null }` (a transient blob throw — rate-limit/5xx — is treated as a miss, not propagated). If `v?.statusCode === 200`: stream `v.stream` with `Content-Type: image/webp`, `Cache-Control: CACHE_CONTROL`, and **`ETag: variantEtag(photoId, width, updatedAt)`** (NOT the blob's own content etag — the top-of-function 304 compares against `variantEtag`, so forwarding `v.blob.etag` would break revalidation). No `sharp`, no original fetch.
  2. **MISS** (`v` null): fetch the original (existing `get(blobKey)`), `sharp().rotate().rotate(rotation).resize(w).webp()` (unchanged pipeline) → the resized buffer. **Stream that buffer regardless of cache-write outcome**, and persist it: `try { await put(variantPath, buf, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "image/webp" }) } catch (e) { console.error(...) }` — `allowOverwrite:true` makes a concurrent double-miss genuinely last-write-wins (deterministic identical bytes); the try/catch guarantees a cache-write race or blob outage can never fail the response. **await** (not fire-and-forget): a bare un-awaited `put` is dropped when the serverless function freezes post-response — the only safe async form is `waitUntil`, not worth it for a once-per-variant write.
- **Passthrough (no `?w=`)**, the decode-bomb guards, the variant ETag, `Cache-Control`, and the 304 short-circuit are **unchanged**. Only the resize branch gains the (best-effort) variant lookup.
- **Variant access is always `private`** (the variant is a fresh server-created blob, independent of the source's `getBlobAccess`; all current uploads are private; the `put` access and the `get` access must match). webp retained (avif is a trivial follow-on now encode is amortized — out of scope; changes Content-Type + first-miss latency).

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
  - **HIT**: `get(variantPath)` returns `{statusCode:200, stream}` → response is that stream, `put` NOT called, original `get(blobKey)` NOT called; **response `ETag === variantEtag`** (so a follow-up If-None-Match still 304s) and `Content-Type: image/webp`.
  - **MISS**: variant `get` null, `get(blobKey)` returns the original → response streams the resized bytes (decoded width ≤ w); `put` called once with `contentType image/webp`, `addRandomSuffix:false`, `allowOverwrite:true`.
  - **same-pathname round-trip**: capture the pathname passed to `put` on a MISS; a second call where the mocked `get` returns 200 **only for that exact pathname** serves from the variant (no resize) — proves write-key === read-key.
  - **best-effort fallback**: (a) variant `get` THROWS → falls through to resize-from-original and returns 200 (not 500); (b) `put` REJECTS (already-exists/outage) → the resized bytes are still returned 200.
  - **version**: two MISSes with different `updatedAt` → `put` pathnames differ (rotation busts the variant).
  - passthrough (no `w`) → no variant `get`/`put`.
- **`photo-variants.test.ts`**: `deleteVariants` calls `list` with the prefix and `del` with the listed urls; a `del`/`list` rejection is swallowed (logged), never thrown; `variantPrefix` shape.
- **Photo DELETE route test** (the DELETE handler currently has **no test** — create the block): 401/404/403 guards (no `del`, no variant cleanup); 200 happy path → `del(blobKey)` then `deleteVariants(variantPrefix(id, photoId))`; a variant-cleanup failure does not fail the response.
- **`CollectionPurgeService`**: extend its DB integration test (or a focused unit) asserting `deleteVariants` is invoked for the collection prefix post-commit (mock blob `list`/`del`).
- e2e: behavior unchanged (image still renders at `?w=`); variant persistence is server-internal (Blob mocked in e2e), so it stays unit-covered.

## Risks
- **Concurrent double-miss** → two `put`s to the same deterministic pathname; identical bytes, last-write-wins — harmless. (Not worth a lock.)
- **`get` by pathname** (not full URL) for the variant: `@vercel/blob get(urlOrPathname)` accepts a pathname; the variant is `put` with `addRandomSuffix:false` so the pathname is exact. Verify in impl.
- **Storage growth** from rotation-orphaned old-version variants — bounded by the prefix sweep on photo delete / collection purge; tiny webp.
- **Serving-path latency on miss** is unchanged from A (one extra `put` after the resize, off the response's critical bytes — can be fire-and-forget if needed; default await for simplicity).
