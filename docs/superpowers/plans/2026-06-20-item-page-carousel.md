# Item Page Carousel Implementation Plan (sub-project C)

> REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. `- [ ]` steps.

**Goal:** Replace the Hero-centric item page with a tap-first photo carousel + an info card (side-by-side at `lg`, stacked below), reusing B's viewer.

## Global Constraints
- Tap-first, **NO swipe / no drag-to-advance**. Nav = Prev/Next buttons + dots(≤6)/counter(>6) + ArrowLeft/Right. Buttons stay mounted with `aria-disabled` at ends (focus never lost).
- Arrows carry `PhotoViewControl`-style contrast armor (`bg-surface` disc + `ring-1 ring-ink/10` + `shadow-lift`, `h-11 w-11`). Dots/counter BELOW the frame.
- Fixed `aspect-[4/3]` `bg-ground` `object-contain` frame. Photo order: hero first, then `createdAt` asc, then `id` (in the page; don't touch `findByItem`).
- Reuse `PhotoViewControl`/`ImageViewer` for rotate+zoom. Slides keyed by `photo.id`; index in `useState`.
- `lg:grid-cols-[3fr_2fr]`; stacked carousel-first below lg.
- Gates green: build, test:ci, lint, test:db, e2e.

---

### Task 1: `ItemMetadata` affirming empty state (purses-0gv)
**Files:** `src/features/items/ItemMetadata.tsx`, `src/features/items/ItemMetadata.test.tsx` (create if absent).
**Interfaces:** `ItemMetadata` gains an optional `editHref?: string` (used by the empty-state CTA).
- [ ] Failing test: empty item → renders an affirming prompt (e.g. /tell its story|add/i) and a CTA link to `editHref`; asserts text "No details added yet" is NOT present. Present item → fields render.
- [ ] Run → fail.
- [ ] Implement: replace the `"No details added yet"` branch with an affirming message + `<Link href={editHref}>` CTA (gentle copy). Keep the fields branch.
- [ ] Run → pass. Commit.

### Task 2: `ItemPhotoCarousel`
**Files:** `src/features/items/ItemPhotoCarousel.tsx` (new, client), `…/ItemPhotoCarousel.test.tsx`.
**Interfaces:** `ItemPhotoCarousel({ photos, collectionId, itemName, addPhotosHref }: { photos: ViewerPhoto[]; collectionId: string; itemName: string; addPhotosHref: string })` — `photos` already ordered hero-first.
- [ ] Failing tests (jsdom): empty `photos` → add-photos CTA, no nav; single photo → photo, no arrows/dots; 3 photos → Next changes the shown `src`/position text, Prev too; dots (3) each a button ≥ h-11 with `aria-current` on current; >6 photos → counter "1 of 7", no dots; ends → Prev `aria-disabled` at index 0, Next `aria-disabled` at last (still in DOM); ArrowRight/Left move; `aria-live` text "Photo 2 of 3"; a "View photo" control present.
- [ ] Run → fail.
- [ ] Implement: `"use client"`; `useState(index)`; current `photo = photos[index]`; `src = getPhotoAssetUrl(collectionId, photo.itemId, photo.id, { w: 1280, v })` (or accept prebuilt). Frame `relative aspect-[4/3] bg-ground` + `<Image fill object-contain unoptimized key={photo.id}>`; arrows (backplate discs, `aria-disabled`+no-op at ends); `PhotoViewControl` overlay; below-frame dots/counter; `aria-live` region; `onKeyDown` arrows. Empty/single guards.
- [ ] Run → pass. Commit.

### Task 3: Item page restructure + page test
**Files:** `src/app/collections/[id]/items/[itemNumber]/page.tsx`; CREATE `…/[itemNumber]/page.test.tsx`.
- [ ] Failing page test (mirror an existing page.test under src/app/collections — mock getSession/db/repos): renders the carousel (a "View photo" or nav control) + the Details card + an "Edit details" link; asserts NO element with the old hero `h-96` class / the old "No hero photo" copy.
- [ ] Run → fail.
- [ ] Implement: order photos hero-first (`[...photos].sort((a,b)=> Number(b.isHero)-Number(a.isHero) || +a.createdAt - +b.createdAt || (a.id<b.id?-1:1))`); two-column `grid gap-8 lg:grid-cols-[3fr_2fr]`; left = `ItemPhotoCarousel` (photos mapped to viewer fields, addPhotosHref); right = name/brand header + Details `Card` (header with "Edit details" link + `ItemMetadata` with editHref). Remove the hero block, the Photos thumbnail grid, and the no-photo Card blocks. Keep breadcrumbs + header + "Add a name".
- [ ] Run → pass; `tsc`; `npm run test:ci` (no other page test broke). Commit.

### Task 4: e2e
**Files:** `e2e/item-page.spec.ts` (new).
- [ ] Seed a collection + item with ≥2 photos (extend seed or insert a 2nd photo row); intercept `**/photos/**/file*`. Navigate to the item; assert the carousel photo visible, Next advances (position text changes), the Details card present, the "View photo" control opens the dialog. Run `npm run test:e2e -- item-page`. Commit.

## Self-review
- Spec coverage: carousel(§1)→T2; details(§2)→T1; layout/order/drop-hero(§3)→T3; tests→all+T4. ✓
- Un-mocked cross-layer: e2e crosses the real page+route+DB. ✓
- Regression: T3 asserts the old hero block is gone. ✓
