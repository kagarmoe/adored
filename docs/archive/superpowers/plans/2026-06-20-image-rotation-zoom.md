# Image Rotation + Zoom Implementation Plan (sub-project B)

> REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. `- [ ]` steps. Depends on A merged to main.

**Goal:** Persist per-photo rotation and let users rotate (everywhere) + zoom (cards) via one `ImageViewer` lightbox.

**Architecture:** `photos.rotation` column → applied non-destructively in A's `servePhotoFile` sharp pipeline → PATCH endpoints (write-tier authz) → a stretched-link card "view" control opening a reusable `ImageViewer` (zoom + rotate).

## Global Constraints
- Rotation values `{0,90,180,270}` only; reject else `400`. Absolute (idempotent) PATCH body `{rotation}`.
- PATCH authz: belongs-to-parent `404` **before** `canAddPhotos || isOwner` `403`. Assert `PhotoRepository.update` NOT called on 401/403/404/400.
- `create` input keeps `rotation?` optional. `/file` orientation-correct on passthrough too (sharp when `rotation!==0`).
- Cards use the **stretched-link** pattern — no `<button>` inside `<a>`. Controls ≥44px, token backplate, aria-labels, `aria-live` for rotate outcome. Reuse `ConfirmDialog` modal idiom. AA both themes. No swipe.
- Every gate green: `build`, `test:ci`, `lint`, `auth:verify`, `test:db`, `test:e2e`.

---

### Task 1: `photos.rotation` column + repo + migration + DB test
**Files:** `src/lib/db/schema.ts`, `src/types/domain.ts`, `src/server/repositories/implementations/PhotoRepository.ts`, `drizzle/000N_*.sql` (generated), `src/lib/db/photo-rotation.integration.test.ts` (new).
- [ ] Write failing DB test (`RUN_DB_TESTS=1`): create a photo (no rotation) → `findById` rotation === 0; `update(id,{rotation:90})` → `findById`/`findByItem` rotation === 90.
- [ ] `npm run test:db -- photo-rotation` → fails (column missing).
- [ ] schema: add `rotation: integer("rotation").default(0).notNull()` to `photosTable`. `npm run db:generate`; commit the new SQL + `drizzle/meta` snapshot.
- [ ] `domain.ts`: add `rotation: number` to `Photo`.
- [ ] `PhotoRepository`: param type → `Omit<Photo,"id"|"createdAt"|"updatedAt"|"deletedAt"|"rotation"> & { rotation?: number }`; `.values({..., rotation: data.rotation ?? 0})`; `mapToPhoto` → `rotation: row.rotation`.
- [ ] `npm run test:db -- photo-rotation` + `tsc --noEmit` (catches broken create callers) → pass. Commit.

### Task 2: apply rotation in `servePhotoFile` + update A's route tests
**Files:** `src/lib/photo-serving.ts`(.test), both `/file` `route.ts`(.test).
- [ ] Update `photo-serving.test.ts`: composition test on `IMG_0428.jpeg` — `rotation:0` → ratio height>width; `rotation:90` → width>height (not double-rotated). Passthrough `rotation:90` → output is webp (re-encoded); `rotation:0` passthrough → verbatim. Run → fails.
- [ ] `servePhotoFile`: add `rotation: number` to args; resize branch `.rotate().rotate(rotation)`; passthrough branch: if `rotation!==0` run sharp (`.rotate().rotate(rotation).webp()`), else stream verbatim. Run → pass.
- [ ] Update both route tests' `toHaveBeenCalledWith` to include `rotation: photo.rotation`; add a non-zero rotation forwarded case. Routes pass `rotation: photo.rotation`. Run both route tests → pass. `tsc`. Commit.

### Task 3: PATCH rotation — item route
**Files:** `src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/route.ts` (add PATCH to existing DELETE route), `route.test.ts`.
- [ ] Failing tests: `401`; `404` wrong-parent; `403` non-member; `403` member without `canAddPhotos`; `200` `{rotation:90}` persists (calls `update`); `rotation:45`→`400`; missing/non-int body→`400`. Assert `update` NOT called on each 401/403/404/400.
- [ ] Implement PATCH: parse body in try/catch (`400` on bad json), validate `rotation ∈ {0,90,180,270}` (`400`), belongs-to-parent (`404`), `membership.canAddPhotos || isOwner` (`403`), `photoRepo.update(photoId,{rotation})`, `200 { rotation, updatedAt }`. Run → pass. Commit.

### Task 4: PATCH rotation — pool route
**Files:** pool `…/pool/photos/[photoId]/route.ts` (new or add PATCH), `route.test.ts`.
- [ ] Failing tests mirror Task 3 + pool 3-conjunct guard: cross-collection→`404`, assigned photo (`itemId!==null`)→`404`. `update` NOT called on failures.
- [ ] Implement: guard `!photo || photo.collectionId!==id || photo.itemId!==null → 404`; `canAddPhotos||owner` `403`; validate; update; `200 {rotation,updatedAt}`. Run → pass. Commit.

### Task 5: `v` cache-bust param + thread into builders
**Files:** `src/lib/photos.ts`(.test), card/hero URL build sites.
- [ ] Add failing helper test: `getPhotoAssetUrl("c","i","p",{w:640,v:5})` → `…/file?w=640&v=5`; `{v:5}` only → `…/file?v=5`.
- [ ] `PhotoUrlOptions` add `v?: number`; `withQuery` builds `?w=…&v=…` (omit absent). Run → pass.
- [ ] Thread `v: cover.updatedAt.getTime()` (or `photo.updatedAt`) at the card/hero build sites that will rotate (collections, items, item-detail). Component/page tests assert `v=` present where rotated. Commit.

### Task 6: `ImageViewer` + card view control (stretched-link)
**Files:** `src/components/ui/ImageViewer.tsx` (new), `src/features/items/PhotoViewControl.tsx` (new) or co-located; `CollectionCard.tsx`, `ItemCard.tsx`, item-detail `page.tsx`; tests.
- [ ] Failing component tests (jsdom): view control opens viewer & does not navigate (stretched-link); `ImageViewer` zoom +/- changes `transform: scale`; rotate → PATCH with next absolute rotation, `aria-live` announces, refresh; Escape/backdrop close; focus trap; `aria-modal`.
- [ ] Restructure `CollectionCard`/`ItemCard` to stretched-link (relative container; `<Link absolute inset-0>`; content siblings; view control `<button>` sibling, z-above, token backplate `bg-surface/90 text-ink shadow-lift`, ≥44px, `aria-label`). Build `ImageViewer` reusing `ConfirmDialog` idiom (scrim `bg-black/60 backdrop-blur-sm`, `bg-surface` cluster, `shadow-raised`, role=dialog aria-modal, focus trap, reduced-motion); zoom (scale 1–4 clamped) + rotate (optimistic → PATCH → reconcile via img onLoad + returned updatedAt → router.refresh; revert on fail) + `aria-live`.
- [ ] Run component tests → pass. `npm run lint` (no a11y regressions). Commit.

### Task 7: e2e rotate flow
**Files:** `e2e/image-rotate.spec.ts` (new).
- [ ] Seed (seedTriageScenario); intercept `**/photos/**/file*` + the PATCH; open viewer from a card, rotate → assert PATCH fired and image `src` `v=` changed; zoom +/- changes scale. Run `npm run test:e2e -- image-rotate`. Commit.

## Self-review
- Spec coverage: data(§1)→T1; serve(§2)→T2; PATCH(§3)→T3/T4; v(§4)→T5; UI(§5)→T6; tests→all + T7. ✓
- Un-mocked cross-layer: T1 DB round-trip + T2 real sharp. ✓
- A's existing tests updated in T2 (the required edit). ✓
