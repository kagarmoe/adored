# Image Performance — caching + on-demand resize (sub-project A)

**Bead:** purses-u1lr.1 · **Epic:** purses-u1lr · **Date:** 2026-06-20
**Status:** revised after adversarial review (wf_fdebbbf1-a42) — folded findings below.

## Problem

Photos load slowly and ship full-resolution bytes to tiny cards. Verified root causes (image-pipeline investigation, 2026-06-20):

1. **No caching.** Both photo `/file` routes return `Cache-Control: private, no-cache` and **never emit an ETag** → every `<img>` render revalidates a round-trip through the function (auth + 4 DB lookups + a Vercel Blob `get()`), re-streaming full bytes. The existing `If-None-Match → 304` branch is dead because the route hands the client no validator.
2. **No resizing.** No `?w=` and no image lib. A 4 MB phone photo is streamed verbatim to a ~150 px card. `unoptimized` is set on every `next/image` (blobs are `access:'private'`, the route is cookie-gated, the Next optimizer fetches server-side without the cookie → 401), so Next's resizer can't help and **`unoptimized` must stay** (commit `002e71f`/#188).

Scope is **performance only**: caching + resize + EXIF auto-orient. User rotation + zoom = B; carousel redesign = C.

## Solution

### 1. Caching — `max-age` + `must-revalidate` + a variant ETag
On the **200** response of the shared serving path:
- `Cache-Control: private, max-age=300, must-revalidate`.
  - Within 300 s: served from browser cache, **no request** (kills the per-render re-download — the core win).
  - After 300 s: `must-revalidate` forces a conditional GET; the route re-runs **authz first**, then returns `304` (no bytes) if the ETag still matches, `200` (new bytes) if not.
  - **Why not `immutable, 1yr`:** these are private, per-user-authz'd images in a **tablet-first, shared-device** app. A year-long immutable cache lets the next user on the same browser re-view the previous user's photos with zero server round-trip (no authz recheck). `max-age=300` bounds that exposure to 5 minutes and restores authz on every revalidation, while keeping ~all the byte-savings.
- **Strong ETag** `"<photoId>:<w|orig>:<updatedAtMs>"`. Version lives **in the ETag** (from `photo.updatedAt`), so after B's rotation bumps `updatedAt`, the next revalidation's ETag won't match → `200` fresh (≤5 min stale). No URL version param needed.
- **`servePhotoFile` owns the validator end-to-end** (resolves the review BLOCKER): it computes the variant ETag and compares the client `If-None-Match` **app-side**; on match returns `304` **before** fetching/resizing the blob. It must **NOT** forward the client `If-None-Match` into `@vercel/blob get()` (whose `ifNoneMatch` compares the blob's *content* etag, a different namespace → would never match → permanent 200). The current pass-through of the header to `get()` is removed.
- **Authz precedes the validator** (resolves Security finding): the route runs authz, *then* calls `servePhotoFile`. An unauthorized caller gets `403/404` even with a matching `If-None-Match` — never a `304` oracle.

### 2. On-demand resize (`sharp`) — guarded
Add `sharp` and `export const runtime = 'nodejs'` on both `/file` routes (sharp is a native addon; pin Node, don't rely on the App-Router default — resolves Architect finding). `servePhotoFile`:
- Reads `w`. **Allowlist** `{160, 320, 640, 1280}`.
  - `w` absent → **original passthrough**: stream `result.stream` verbatim with the stored `Content-Type`, **no sharp, no buffering** (download / full-res zoom). The stream is consumed exactly once.
  - `w` ∈ allowlist → buffer the blob (`await new Response(result.stream).arrayBuffer()`), `sharp(buf, { limitInputPixels: 24_000_000, failOn: 'truncated' }).rotate()` (EXIF auto-orient) `.resize({ width, withoutEnlargement: true }).webp({ quality: 80 })`; respond `Content-Type: image/webp`.
  - `w` present, **not** in allowlist → **`400`** (validate at the trust boundary; prevents arbitrary-size cache/compute amplification).
- **Decode-bomb guard** (resolves Security/Perf major): before buffering, reject a source whose byte length exceeds a ceiling (`RESIZE_MAX_SOURCE_BYTES = 25 MB`); `limitInputPixels` caps decoded pixels so a small-but-huge-dimension file can't OOM the function.
- **EXIF auto-orient** (`.rotate()` no-arg) fixes sideways phone photos on resized variants. Original passthrough is not re-encoded; modern browsers default `image-orientation: from-image` for `<img>`, so passthrough/zoom still renders upright. (B owns any explicit zoom orientation if needed.)
- **webp**, not avif: variants are resized on the fly per request (not persisted — see Risks), so avif's slow encode would tax every cold request. Revisit if the persisted-variant-cache follow-up lands.

### 3. URL helpers + per-surface widths
Extend `src/lib/photos.ts` helpers with an options bag appending **only** `?w=` (version is server-side in the ETag):
- `getPhotoAssetUrl(collectionId, itemId, photoId, opts?: { w?: number })`
- `getPhotoAssetUrlForPhoto(photo, collectionId, opts?: { w?: number })`
- `getPoolPhotoAssetUrl(collectionId, photoId, opts?: { w?: number })`

**Per-surface widths** (one width per surface — `unoptimized` precludes srcset; 640 is a deliberate 2× retina default for cards, savings are dominated by the original→webp drop):
| Surface | Width |
|---|---|
| Pool grid (≤6 cols) | `320` |
| Cards: ItemCard, CollectionCard, CompareChoice, MostLovedHero, triage | `640` |
| Item-detail hero | `1280` |
| Item-detail gallery tiles | `640` |
| Zoom / download (B/C) | original (no `w`) |

### 4. De-duplicate the serving path
The item and pool `/file` serving blocks are byte-identical (~25 lines). Extract the **serving** half into `servePhotoFile({ blobKey, mimeType, photoId, updatedAt }, request)` — it calls `get()` itself, branches passthrough/resize, computes the ETag, handles 304, sets headers. **Authz stays per-route** (item-scoped vs pool checks genuinely differ). `servePhotoFile` is only ever called after authz succeeds.

## Components / files
- `src/lib/photos.ts` — helper option bag + `?w=` (pure; unit-tested).
- `src/lib/photo-serving.ts` *(new)* — `servePhotoFile()` + `RESIZE_WIDTHS`, `RESIZE_MAX_SOURCE_BYTES`. blob `get` mocked in unit tests; sharp real.
- `src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/file/route.ts` — keep authz, delegate to `servePhotoFile(photo, request)`, add `runtime='nodejs'`, **stop** forwarding `If-None-Match` to `get()`.
- `src/app/api/collections/[id]/pool/photos/[photoId]/file/route.ts` — same.
- Render sites pass `{ w }` per the table: `ItemCard`, `CollectionCard`, `CompareChoice`, `MostLovedHero`, `PoolPhotoGrid`, item-detail page (hero/gallery), and the page-level URL builders (collections, items, results, compare, triage). Add `loading="lazy"` to offscreen grid images to tame first-paint herd.
- `package.json` — add `sharp` (pin a known-good version).
- *(Dropped from A:* removing `next.config.mjs` `remotePatterns` — unrelated churn; split to a chore if wanted.)*

## Data flow
`<img src="/file?w=640">` → route authz → `servePhotoFile`: compute ETag from `{photoId, w, updatedAt}` → If-None-Match matches? `304`. Else `get(blobKey)` → (`w` allowlisted? buffer+sharp.resize.webp : stream original) → headers `Cache-Control: private, max-age=300, must-revalidate` + `ETag`. Browser caches 5 min (no request); after, cheap 304s.

## Error handling
- `w` not allowlisted → `400`; source over `RESIZE_MAX_SOURCE_BYTES` → `400`.
- No session → `401`; item/photo mismatch → `404`; non-member/non-owner → `403` (unchanged; before the validator).
- Blob missing → `404`. sharp/processing failure → `500` with a **generic** body `{ error: 'Image processing failed' }`; log details server-side (don't echo `error.message`).

## Testing (TDD; every behavior; runs in CI)
**Unit — `servePhotoFile` (`src/lib/photo-serving.test.ts`)**, blob `get` mocked, **`sharp` real** against `e2e/fixtures/photos/`:
- no `w` → original `Content-Type`, bytes unchanged, `Cache-Control: …max-age=300, must-revalidate`, `ETag` set; assert **`get` not called with `ifNoneMatch`** (blocker regression guard).
- each `w ∈ {160,320,640,1280}` → `Content-Type: image/webp`, decoded width ≤ w, smaller than original (parametrized).
- `w=999` → `400`; source > ceiling → `400`.
- `If-None-Match == ETag` → `304`, no body, **without** calling `get`/sharp (proves app-side short-circuit before blob/compute).
- two calls same `photoId`/`w` but different `updatedAt` → **different ETags** (the immutable-safety / freshness invariant).
- EXIF fixture (`IMG_0428.jpeg` if it carries an orientation tag, else add one) → resized webp decoded dims are upright (proves `.rotate()` ran).
**Unit — route handlers:**
- **CREATE** `…/items/.../file/route.test.ts` (does **not** exist today) with full mock set incl. `ItemRepository`: 401/403/404/200 + asserts `Content-Type` + `Cache-Control` + `ETag` on 200.
- **EXTEND** pool `route.test.ts` (401 already covered) to assert the new headers and a **route-level** `If-None-Match → 304` (proves the route forwards the header into `servePhotoFile`), and **unauthorized + matching If-None-Match → 403, never 304**.
**Unit — helpers (`src/lib/photos.test.ts`)**: `?w=` appended correctly; no `w` → no query.
**Component**: assert each render site passes its table width (at least the distinct tiers: pool=320, card=640, hero=1280) to its URL builder.
**e2e (`e2e/image-perf.spec.ts`)**: card `/file` requests carry `?w=640`, pool grid `?w=320`, item hero `?w=1280` (via `waitForRequest`) — per-surface threading end-to-end. (Blob mocked in e2e; real header/resize behavior covered by the un-mocked-sharp unit test.)

CI: unit → `gate` job (`npm run test:ci`); e2e → `e2e` job (routes under `src/app/**` trigger it).

## Out of scope (filed)
- **Persisted variant cache** (resize-once-globally: write each variant back to Blob under a deterministic key, serve thereafter) → **new bead** (purses-u1lr.1a). Deferred because the user-perceived win (≈4 MB→~50 KB to the device) is delivered by on-demand resize even cold; persistence is a server-cost/herd optimization, and adds variant-blob purge-orphan handling that interacts with rotation versioning + collection purge. Mitigate the first-paint herd now with `loading="lazy"`.
- User rotation + `photos.rotation` column, zoom UI → **B**. Carousel/info-card redesign → **C**. Public token image endpoint for shared-results → existing **purses-bwr**.

## Risks
- **sharp on Vercel / cold start** — only the resize branch uses sharp; passthrough stays a pure stream; `runtime='nodejs'` pinned. Decode-bomb bounded by `limitInputPixels` + source-byte ceiling.
- **First-paint herd** (N cards → N concurrent resizes) — bounded by `loading="lazy"` (only visible cards fetch first) + the OOM guard; fully collapsed later by the persisted-variant-cache bead.
- **Removing `unoptimized` would break prod silently** (jsdom mock strips the prop) — we are NOT removing it; keep the comment + the "loads `/file` directly" assertions.
