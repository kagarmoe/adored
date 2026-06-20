# Image Manipulation — persisted rotation + zoom (sub-project B)

**Bead:** purses-u1lr.2 · **Epic:** purses-u1lr · **Date:** 2026-06-20 · depends on A (purses-u1lr.1)

## Problem / requirements
From the epic:
- **Rotate (MUST):** the user must be able to rotate images — on the item page, the item grid (`collections/[id]/items`), and the collection-list cards (`collections/`) — and it **persists** (survives reload, applies after item creation).
- **Zoom (SHOULD):** on `collections/` cards, images are often too large for the card (esp. phone); the user should be able to zoom in/out.

Phone photos arrive sideways and there's no way to fix them; covers are cropped with no way to see the whole image. Tablet-first, **tap-first, no swiping** (TONE/CLAUDE).

## Solution overview
Rotation is stored per-photo and applied **non-destructively** in A's `servePhotoFile` sharp pipeline. Both rotate and zoom are reached through one gentle, reusable **`ImageViewer`** lightbox opened by a single "view" icon on each card image — keeping cards uncluttered (one control surface, low cognitive load) while satisfying rotate-everywhere + zoom.

### 1. Data — `photos.rotation`
- Add `rotation: integer('rotation').default(0).notNull()` to `photosTable` (`src/lib/db/schema.ts`); generate the migration (`ALTER TABLE "photos" ADD COLUMN "rotation" integer DEFAULT 0 NOT NULL`). Use `integer` (already imported) not `smallint` (avoids an import; PG stores it fine). Values constrained at the API boundary to `{0, 90, 180, 270}` (degrees clockwise).
- `Photo` interface (`domain.ts`): add `rotation: number`.
- `PhotoRepository`: `mapToPhoto` adds `rotation: row.rotation`; `create` relies on the DB default (no change needed if omitted, but add `rotation: data.rotation ?? 0` for explicitness). `update` already spreads `...data` so `update(id, { rotation })` works.

### 2. Serve — apply rotation in the sharp pipeline (builds on A)
- `servePhotoFile` args gain `rotation: number`. In the **resize** branch, after EXIF `.rotate()` add `.rotate(rotation)` (user rotation, clockwise; 0 is a no-op). Composition: EXIF-orient first, then the user's explicit turn.
- Both `/file` routes pass `rotation: photo.rotation`.
- ETag already includes `updatedAt`; a rotate bumps `updatedAt` (via `PhotoRepository.update`) → ETag changes → cache busts. **Passthrough (no `?w=`) does not re-encode**, so the zoom viewer requests a resized large width (`1280`) which goes through sharp and *is* rotated.

### 3. Instant freshness after rotate — re-add `v` to URLs
- Re-introduce the `v` option in the URL helpers: `getPhotoAssetUrlForPhoto(photo, id, { w, v })` where callers pass `v: photo.updatedAt.getTime()` (a `withVersion` convenience may derive it). The server ignores `v` for content (only `w` matters; ETag derives version from `updatedAt`); it exists purely so the **URL changes when rotation changes**.
- After a rotate PATCH succeeds, the client calls `router.refresh()`; the server re-renders the card/hero with a new `?w=…&v=<newUpdatedAt>` → the browser fetches the rotated variant immediately instead of waiting out `max-age=300`.

### 4. PATCH rotation endpoints
- `PATCH /api/collections/[id]/items/[itemId]/photos/[photoId]` — body `{ rotation: 0|90|180|270 }` (absolute, idempotent). Authz: belongs-to-parent (`404`) + member-or-owner (`403`) — same tier as the `/file` GET; rotation is low-risk, non-destructive, reversible. Validate `rotation` ∈ allowed set (`400` otherwise). `200 { rotation }`.
- `PATCH /api/collections/[id]/pool/photos/[photoId]` — same, for pooled photos (`itemId === null`, this collection).
- Validation lives at the boundary (Zod or a small guard). No partial state — a single `update`.

### 5. UI — `ImageViewer` + `PhotoViewButton`
- **`PhotoViewButton`** (client): a small, gentle icon button (⤢ / magnifier) overlaid on a card image (bottom-right), `min-h-11 min-w-11` (≥44px), `aria-label="View photo"`, visible (no hover-only). Inside a card `<Link>` it calls `e.preventDefault(); e.stopPropagation()` so it opens the viewer instead of navigating. Renders nothing when there's no photo.
- **`ImageViewer`** (client modal): tap-to-open lightbox showing the photo at `?w=1280`. Controls (all ≥44px, labeled): **Zoom in (+) / Zoom out (−)** stepping a CSS `transform: scale()` (1×–4×, clamped) on the image; **Rotate** (↻) → `PATCH … { rotation: (current+90)%360 }`, optimistic (immediately CSS-rotate the viewer image), on success `router.refresh()`, on failure revert + gentle error; **Close** (✕ / backdrop tap / Escape). No swipe; focus-trapped; `role="dialog"` `aria-modal`; reduced-motion respected. Reuses A's width via `getPhotoAssetUrl{ForPhoto}`.
- **Wiring:** `collections/` cards (`CollectionCard`) → `PhotoViewButton` (zoom + rotate). `collections/[id]/items` cards (`ItemCard`) → `PhotoViewButton` (rotate; zoom harmless/consistent). Current item page hero/gallery → `PhotoViewButton` (C will fold this into the carousel). The viewer needs the photo's id/itemId/rotation/updatedAt + collectionId — passed as a small `viewerPhoto` prop alongside the existing URL props.
- Gentle/tone: judgement-free labels ("View photo", "Rotate"), no counts/badges; controls are quiet until focused (DESIGN tokens, AA contrast, both themes).

## Components / files
- `src/lib/db/schema.ts` (+`rotation`), `drizzle/000N_*.sql` (generated), `src/types/domain.ts` (+`rotation`), `src/server/repositories/implementations/PhotoRepository.ts` (`mapToPhoto`/`create`).
- `src/lib/photo-serving.ts` (+`rotation` arg, `.rotate(rotation)`), both `/file` routes (pass `rotation`).
- `src/lib/photos.ts` (re-add `v` to `PhotoUrlOptions`).
- `src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/route.ts` (PATCH; may be new file or add to existing DELETE route), pool equivalent.
- `src/features/items/ImageViewer.tsx` (new), `src/features/items/PhotoViewButton.tsx` (new) — or under `src/components/ui`.
- Card surfaces: `CollectionCard.tsx`, `ItemCard.tsx`, item-detail `page.tsx`, and the pages building the viewer photo props.

## Testing (TDD; runs in CI)
- **DB-backed (un-mocked, `src/lib/db/photo-rotation.integration.test.ts`, `RUN_DB_TESTS=1`):** `rotation` defaults to 0 on insert; `update(id,{rotation:90})` round-trips via `findById`/`findByItem`; `mapToPhoto` is `any`-typed so this guards the mapping.
- **servePhotoFile (`photo-serving.test.ts`):** `rotation:90` on a landscape fixture → resized output dims swap (proves `.rotate(rotation)` ran after EXIF); `rotation:0` unchanged from A's behavior.
- **PATCH routes (unit):** 401/404(belongs-to-parent)/403(non-member)/200; `rotation:45`→400, `rotation:90`→200 persists; pool route same. Authz-before-mutation.
- **Component (jsdom):** `PhotoViewButton` opens the viewer and (inside a Link) does not navigate (preventDefault); `ImageViewer` zoom +/- changes the scale, rotate issues the PATCH with the next absolute rotation and refreshes, Escape/backdrop closes, focus trap, `aria-modal`.
- **e2e (`e2e/image-rotate.spec.ts`):** open the viewer from a card, tap rotate, assert the PATCH fired and the image `src` `v=` changed (rotation persisted); zoom +/- changes scale. Touches `src/features/**` → triggers the e2e CI job.
- **a11y:** controls keyboard-operable, labeled, AA contrast (web-accessibility lens).

## Out of scope
- Item-page carousel redesign → **C** (purses-u1lr.3) reuses `ImageViewer`.
- Bulk/multi-photo rotate; arbitrary-angle rotation (only 90° steps).
- Persisted variant cache → purses-u1lr.4.

## Risks
- **Double-rotation (EXIF + stored).** Pipeline is `.rotate()` [EXIF] then `.rotate(stored)` — verified by a fixture test; stored rotation is the user's delta on top of the upright image.
- **Optimistic rotate divergence.** On PATCH failure, revert the CSS rotation + show a gentle error; `router.refresh()` only on success.
- **Nested interactive (button in card Link).** `preventDefault`+`stopPropagation`; ensure keyboard focus order is sane (the view button is a real `<button>`, not a div).
- **Migration safety.** `ADD COLUMN … integer DEFAULT 0 NOT NULL` is a constant default — safe on Postgres (no table rewrite lock concern on modern PG); runs via `vercel-build` `db:migrate` with the prod `DATABASE_URL`.
