# Image Manipulation — persisted rotation + zoom (sub-project B)

**Bead:** purses-u1lr.2 · **Epic:** purses-u1lr · **Date:** 2026-06-20 · depends on A (purses-u1lr.1)
**Status:** revised after adversarial review (wf_19818d31-78d) — findings folded below.

## Problem / requirements
- **Rotate (MUST):** rotate images — item page, item grid (`collections/[id]/items`), collection-list cards (`collections/`) — and it **persists** (survives reload, applies after item creation). Phone photos arrive sideways.
- **Zoom (SHOULD):** on `collections/` cards images are often too large for the card (esp. phone); zoom in/out.
- Tablet-first, **tap-first, no swiping** (TONE/CLAUDE); gentle, judgement-free.

## Solution overview
Rotation is stored per-photo and applied **non-destructively** in A's `servePhotoFile` sharp pipeline. Rotate + zoom live in one reusable **`ImageViewer`** lightbox opened by a single gentle "view" control on each card image — implemented with the **stretched-link** pattern so the control is valid, accessible DOM (not a `<button>` inside an `<a>`).

### 1. Data — `photos.rotation`
- `rotation: integer('rotation').default(0).notNull()` on `photosTable` (`integer` is already imported; PG stores 0/90/180/270 fine). Generate migration → `ALTER TABLE "photos" ADD COLUMN "rotation" integer DEFAULT 0 NOT NULL` (constant default → safe, instant on PG, no rewrite; reversible via DROP COLUMN). Commit generated SQL **and** the drizzle meta snapshot together.
- `Photo` interface (`domain.ts`): add `rotation: number`.
- `PhotoRepository`: `mapToPhoto` → `rotation: row.rotation`. **`create` input type must keep rotation optional** (else it breaks every existing caller — `Omit<Photo,...>` makes it required): change the param to `Omit<Photo, "id"|"createdAt"|"updatedAt"|"deletedAt"|"rotation"> & { rotation?: number }` and set `rotation: data.rotation ?? 0` in `.values()`. `update` already spreads `...data` → `update(id,{rotation})` works. The task gate runs `tsc --noEmit` so a broken caller surfaces.

### 2. Serve — apply rotation in `servePhotoFile` (orientation-correct on EVERY path)
- `servePhotoFile` args gain `rotation: number`. Both `/file` routes pass `rotation: photo.rotation`.
- **Resize branch:** after EXIF `.rotate()` add `.rotate(rotation)` (user's clockwise turn on top of the upright image; 0 = no-op).
- **Passthrough branch (no `?w=`):** if `rotation !== 0`, route through sharp (`.rotate()` EXIF + `.rotate(rotation)` → `webp`) so the original is orientation-correct too; if `rotation === 0`, keep the pure verbatim stream (the common case stays a fast stream). This **removes the "passthrough serves unrotated" inconsistency** (Architect finding) — `/file` is orientation-correct regardless of `?w=`.
- ETag already keys on `updatedAt`; a rotate bumps `updatedAt` → ETag changes → cache busts.

### 3. PATCH rotation endpoints
- `PATCH /api/collections/[id]/items/[itemId]/photos/[photoId]` — body `{ rotation: 0|90|180|270 }` (absolute, idempotent). **Authz (deliberate write-tier — Security finding):** belongs-to-parent (`404`, *before* the permission check) then **`canAddPhotos || isOwner`** (`403`) — matching the photo-mutation precedent (the DELETE route gates on `canDeletePhotos`; rotation edits photo *presentation*, so `canAddPhotos` is the closest grant). NOT the bare member-or-owner read tier (which would let a view-only curator rotate shared photos). Validate `rotation` ∈ allowed set; reject non-member-of-set / non-integer / missing / unparseable body → `400` (mirror `reassign`'s `try/catch` around `req.json()`). `200 { rotation, updatedAt }` (return `updatedAt` so the client can rebust — Architect finding).
- `PATCH /api/collections/[id]/pool/photos/[photoId]` — same, with the pool **3-conjunct IDOR guard verbatim**: `!photo || photo.collectionId !== params.id || photo.itemId !== null → 404`.

### 4. Instant freshness — new `v` cache-bust param
- Add a **new** optional `v?: number` to `PhotoUrlOptions`, folded into the existing `withQuery` → `?w=…&v=…`. **One reason:** within A's `max-age=300` window the browser serves the cached image without revalidating the *same* URL, so a rotate wouldn't show for up to 5 min; a changed URL (`v` = `updatedAt` ms) forces the new variant immediately. The server ignores `v` for content (only `w` matters; ETag derives the version from `updatedAt`). No `withVersion` helper — callers pass `v: photo.updatedAt.getTime()` where they already have the photo.
- Card/hero URL builders pass `v`. After a rotate, `router.refresh()` re-renders Server Components with the new `v` → the rotated variant loads.

### 5. UI — `ImageViewer` + the card "view" control (stretched-link pattern)
- **Card structure (both `CollectionCard`, `ItemCard`):** wrap the card body in a `relative` container. The navigating `<Link>` becomes a **stretched overlay** (`absolute inset-0`, `aria-label`, low z) — content is no longer *inside* the anchor. The **view control** is a sibling `<button>` (higher z, `pointer-events-auto`) over the image corner → valid DOM, tap-anywhere still navigates, the button overrides. (Removes the invalid `<button>`-in-`<a>` and the `preventDefault` hack — UX/Craftsman finding.)
- **View control:** circular `<button>`, `min-h-11 min-w-11` (≥44px), **token backplate** `bg-surface/90 text-ink shadow-lift` so it meets ≥3:1 non-text contrast on both light/busy and dark photos (Design finding), `aria-label="View photo"`. Renders only when the card has a photo.
- **`ImageViewer`** (client modal, reuses the repo's `ConfirmDialog` modal idiom — Design finding): scrim `bg-black/60 backdrop-blur-sm`, control cluster on `bg-surface` with `shadow-raised` + DESIGN spacing tokens, `role="dialog"` `aria-modal`, focus-trapped, Escape/backdrop/✕ to close, reduced-motion respected. Shows the photo at `?w=1280&v=`. Controls (≥44px, labeled): **Zoom +/−** (CSS `transform: scale()` 1×–4× clamped), **Rotate ↻** → optimistic CSS rotate, `PATCH {rotation:(cur+90)%360}`; on success set the `<img src>` to `?w=1280&v=<updatedAt from response>` and drop the CSS transform on `img onLoad` (reconcile — Architect finding) + `router.refresh()`; on failure revert + gentle message. An **`aria-live="polite"`** region announces "Rotated to N degrees" / the error (UX finding).
- **Wiring:** `CollectionCard` (zoom+rotate), `ItemCard` (rotate; zoom harmless), current item-page hero/gallery (C folds into the carousel). Pages pass a small `viewerPhoto` ({id,itemId,rotation,updatedAt,collectionId}) alongside existing URL props.

## Testing (TDD; runs in CI)
- **DB (un-mocked, `src/lib/db/photo-rotation.integration.test.ts`):** `rotation` defaults 0 on insert; `update(id,{rotation:90})` round-trips via `findById`/`findByItem` (guards the `any`-typed `mapToPhoto`).
- **servePhotoFile (`photo-serving.test.ts`):**
  - **Composition (headline risk)** on `IMG_0428.jpeg` (EXIF orientation 6): `rotation:0` → output **portrait** (height>width, EXIF applied once); `rotation:90` → **landscape** (width>height, one further turn — proves NOT double-rotated). Assert via the height:width ratio inverting (width is clamped to `w` by resize, so assert the ratio, not absolute dims — QA finding).
  - Passthrough with `rotation:90` (no `?w=`) → re-encoded & oriented (not verbatim); `rotation:0` passthrough → verbatim stream unchanged.
- **A's two route delegation tests MUST be updated** to expect `rotation` in the `servePhotoFile` args (exact `toHaveBeenCalledWith`), plus a **non-zero** stored-rotation forwarded case (proves the route reads `photo.rotation`) (QA finding — required edit).
- **PATCH routes (unit, item + pool):** `401` / `404`(belongs-to-parent, before permission) / `403`(non-member) / **`403` member-without-`canAddPhotos`** / `200` persists; `rotation:45`→`400`, non-integer/missing→`400`; pool cross-collection & assigned-photo→`404`. **Negative invariant:** assert `PhotoRepository.update` is **NOT** called on every 401/403/404/400 path (authz-before-mutation — QA finding).
- **Component (jsdom):** view button opens the viewer and does not navigate; `ImageViewer` zoom +/- changes scale, rotate issues PATCH with the next absolute rotation + announces via the live region + refreshes, Escape/backdrop close, focus trap, `aria-modal`.
- **e2e (`e2e/image-rotate.spec.ts`):** open viewer from a card, rotate, assert the PATCH fired and the image `src` `v=` changed (persistence); zoom +/- changes scale. Intercept `**/photos/**/file*` and the PATCH. Touches `src/features/**` → e2e CI job.
- **a11y (web-accessibility lens):** controls keyboard-operable, labeled, AA contrast both themes; live region present.

## Out of scope
- Item-page carousel redesign → **C** (reuses `ImageViewer`). Bulk/multi rotate; arbitrary angles. Persisted variant cache → purses-u1lr.4.

## Risks
- **Double-rotation (EXIF + stored)** — pipeline is `.rotate()` then `.rotate(stored)`; the composition test on the EXIF fixture is the proof.
- **Optimistic divergence** — reconcile via `img onLoad` + the PATCH-returned `updatedAt`; revert on failure.
- **create() type break** — handled by the optional `rotation?` create input + `tsc` gate.
- **Migration** — constant-default ADD COLUMN, safe; runs via `vercel-build db:migrate` with the prod `DATABASE_URL`; test DB applies it via the same path; commit SQL+meta together.
