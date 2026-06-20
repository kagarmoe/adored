# Item Page Redesign — photo carousel + info card (sub-project C)

**Bead:** purses-u1lr.3 · **Epic:** purses-u1lr · **Date:** 2026-06-20 · depends on A + B (merged)
**Folds:** purses-j8e (side-by-side image+info), purses-0gv (details metadata-or-add-prompt).

## Problem
The item page (`collections/[id]/items/[itemNumber]`) is built around a single `isHero` photo in a fixed `h-96` box, with a secondary thumbnail grid and bare "No hero photo" / "No details added yet" states. There's no way to flip through all photos, the layout stacks (wasting tablet/desktop width), and the details section gives no contextual way to add/edit. The epic asks: **drop the Hero-centric layout, let the user flip through images, show an item info card, rotate from here.**

## Solution
A **two-column** item page (tablet-first): a **photo carousel** on the left, an **info card** on the right; **stacked** on phone. Rotate + zoom reuse B's `ImageViewer` (via `PhotoViewControl` on the current photo). Tap-first, **no swipe**.

### 1. `ItemPhotoCarousel` (new client component)
- Flip through **all** the item's photos (not just the hero): one large photo at a time (`?w=1280`, `unoptimized`, `object-contain` in a stable `aspect-[4/3]`/`aspect-square` frame so the layout doesn't jump).
- **Tap-first navigation, no swipe:** a **Prev** (‹) and **Next** (›) button (≥44px, `aria-label`), plus **dot indicators** (tap a dot to jump; `aria-label="Go to photo N"`, current dot `aria-current`). Buttons disabled/hidden at the ends (or wrap — pick non-wrap + disabled for clarity). Single photo → no nav chrome. **Drag is allowed** to advance (TONE permits drag) but is not required; keyboard ArrowLeft/Right move too.
- **Rotate + zoom:** a `PhotoViewControl` (from B) overlaid on the current photo opens the `ImageViewer` (zoom + persisted rotate) for **that** photo. (Reuses B entirely — no new rotate logic.)
- **Empty state** (no photos): occupies the same frame — a gentle, affirming "Add photos" panel with a CTA to `.../photos` (not a bare "No hero photo").
- Announce the current position to AT (`aria-live="polite"`: "Photo 2 of 5").

### 2. `ItemDetails` (redesign of the details section — purses-0gv)
Replace the bare `ItemMetadata` "No details added yet" with two clear states, each with a **section-level** affordance:
- **Has metadata** → the fields (brand/style/color/material/category/notes) **plus** a quiet "Edit details" link in the card header → routes to the existing edit page.
- **No metadata** → an **affirming** add-prompt ("Tell its story" / "Add what you love about it") + a primary CTA to the edit page — judgement-free, never "Missing"/"Incomplete" (TONE).
- Keep `ItemMetadata` as the pure field-renderer; `ItemDetails` wraps it with the state + affordance (or fold both into one component). The name/brand header stays at the top of the info column.

### 3. Page layout (purses-j8e)
- `md:` two columns — carousel left, info card right (`grid md:grid-cols-2` or `md:grid-cols-[3fr_2fr]`); **stacked** on phone (single column, carousel first). Empty-photo state occupies the same left column.
- Remove the old hero block + separate "Photos" thumbnail grid + "No hero photo"/"No photos" blocks (the carousel subsumes them).
- Breadcrumbs + the header name/brand + "Add a name" cue stay.

## Components / files
- `src/features/items/ItemPhotoCarousel.tsx` *(new, client)* + test.
- `src/features/items/ItemDetails.tsx` *(new)* (or extend `ItemMetadata`) + test.
- `src/app/collections/[id]/items/[itemNumber]/page.tsx` — restructure to two columns; pass all `photos` (+ each photo's viewer fields) to the carousel; render `ItemDetails`.
- Reuse `PhotoViewControl`/`ImageViewer` (B), `getPhotoAssetUrlForPhoto` (`?w=`/`v`), DESIGN tokens, `Card`.

## Data flow
Server page loads `photos = photoRepo.findByItem(item.id)` (already does) → passes `[{id,itemId,collectionId,rotation,updatedAt}]` + display URLs to `ItemPhotoCarousel`. Carousel holds the current index (client state); each photo's `PhotoViewControl` opens the viewer; rotate there PATCHes + `router.refresh()` re-renders the page (carousel re-receives updated photos).

## Testing (TDD; runs in CI)
- **`ItemPhotoCarousel` (jsdom):** renders the first photo; Next/Prev change the shown photo and update the `aria-live` position; dots jump; nav chrome hidden for a single photo; ArrowRight/Left move; empty state shows the add-photos CTA and no nav; the `PhotoViewControl` is present and opens the viewer.
- **`ItemDetails` (jsdom):** with metadata → fields + "Edit details" link (href to edit page); without → the affirming add-prompt + CTA (assert it is NOT "No details added yet").
- **Item page test** (extend the existing page test if present): renders the carousel + info card; no longer renders the old hero/`h-96` block.
- **e2e (`e2e/item-page.spec.ts`):** open an item with ≥2 photos; assert the carousel shows a photo, Next advances (a different `/file` request / position text), the info card renders, and the view control opens the viewer. Intercept `**/photos/**/file*`. Two-column at tablet width, stacked at phone (assert via layout, light touch).
- **a11y:** nav buttons labelled ≥44px, dots labelled with `aria-current`, `aria-live` position, keyboard arrows, AA both themes.
- **Screenshots:** item page (carousel + info) light + dark, tablet — required (visible UI change).

## Out of scope
- Reordering photos / setting hero from the carousel (separate concern; hero still set on the photos page). Bulk actions. Persisted variant cache (purses-u1lr.4).

## Risks
- **Layout shift** as photos load — fix the frame aspect ratio so flipping/loading doesn't jump.
- **No-swipe contract** — navigation is buttons/dots/keyboard; drag-to-advance is optional and must not be the only way (and must not hijack vertical scroll).
- **Hero semantics** — dropping the hero-centric *layout* does not drop the `isHero` flag (cards still use it for the cover); the carousel just shows all photos, hero first.
