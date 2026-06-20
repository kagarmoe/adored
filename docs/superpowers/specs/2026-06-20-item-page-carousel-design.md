# Item Page Redesign — photo carousel + info card (sub-project C)

**Bead:** purses-u1lr.3 · **Epic:** purses-u1lr · **Date:** 2026-06-20 · depends on A + B (merged)
**Folds:** purses-j8e (side-by-side image+info), purses-0gv (details metadata-or-add-prompt).
**Status:** revised after adversarial review (wf_c1341867-474) — findings folded.

## Problem
The item page (`collections/[id]/items/[itemNumber]`) is built around a single `isHero` photo in a fixed `h-96` box, with a secondary thumbnail grid and bare "No hero photo" / "No details added yet" states. No way to flip through all photos; the layout stacks (wasting tablet/desktop width); the details section offers no contextual add/edit. The epic: **drop the Hero-centric layout, let the user flip through images, show an item info card, rotate from here.**

## Solution
A **two-column** item page (photo carousel left, info card right) at **landscape-tablet+** width; **stacked** (carousel first) on phone *and portrait tablet*. Rotate + zoom reuse B's `ImageViewer` via `PhotoViewControl`. Tap-first, **no swipe**.

### 1. `ItemPhotoCarousel` (new client component)
- Flip through **all** the item's photos: one at a time at `?w=1280`, `unoptimized`, `object-contain` in a **fixed `aspect-[4/3]` frame with `bg-ground`** (committed ratio + band token → no layout shift, no awkward portrait crop).
- **Navigation — tap-first, NO swipe / NO drag-to-advance** (cut per review; a horizontal advance-drag *is* a swipe). Only:
  - **Prev (‹) / Next (›)** buttons, overlaid on the image edges with the **same contrast armor as `PhotoViewControl`** (`bg-surface` disc + `ring-1 ring-ink/10` + `shadow-lift`, `h-11 w-11`, `aria-label`). They **stay mounted at the ends** and use **`aria-disabled` + no-op** (not the `disabled` attribute) so keyboard/AT focus is never dropped (a11y).
  - **Position indicator BELOW the frame** (off the photo → no contrast problem, keeps the photo dominant): **dots** when ≤ 6 photos (each a ≥44px hit area — small glyph padded inside `h-11 w-11`; `aria-label="Go to photo N"`, current `aria-current`); a plain **"N of M" counter** when > 6 (dots don't scale).
  - **Keyboard** ArrowLeft/Right move; visible focus ring on all controls.
- **Rotate + zoom:** a `PhotoViewControl` (B) overlaid on the current photo opens `ImageViewer` for that photo. *Deliberate trade:* one control, no duplicated rotate path — reuse B's PATCH+optimistic+refresh rather than an inline rotate. Satisfies the epic's "rotate from here." (The carousel's `aria-live` position region won't conflict with the viewer's status region — flips can't happen while the focus-trapped modal is open.)
- **Single photo →** no nav chrome (photo as protagonist). **Empty (no photos) →** the same frame holds a gentle, affirming "Add photos" panel + CTA to `.../photos` (never a bare "No hero photo"/"No photos").
- **`aria-live="polite"`** region announces "Photo 2 of 5".
- **Photo order is decided by the page** (see §3), passed in already-ordered; the carousel keys each slide by `photo.id` and holds the index in `useState` (persists across the post-rotate `router.refresh()` — the client instance isn't remounted).

### 2. Details section (purses-0gv) — minimal, no new component (Craftsman)
- Fix `ItemMetadata`'s empty state: replace `"No details added yet"` with an **affirming add-prompt** ("Tell its story" + a CTA to the edit page) — judgement-free, never "Missing"/"Incomplete" (TONE). A regression test asserts the old copy is gone.
- Add a quiet **"Edit details"** link in the **Details `Card` header** on the page (contextual to the section, routes to the existing edit page) — present whether or not metadata exists (when empty the add-prompt CTA is the primary affordance). No separate `ItemDetails` wrapper.

### 3. Page layout (purses-j8e)
- `lg:` two columns — carousel left, info (name/brand header + Details card) right (`grid gap-8 lg:grid-cols-[3fr_2fr]`); **stacked, carousel first** below `lg` (phone + portrait tablet). Empty-photo state occupies the same left column.
- **Order photos in the page** before passing to the carousel: hero first, then `createdAt` ascending, then `id` (deterministic — `findByItem` has no `ORDER BY`). Do NOT change the shared `findByItem`.
- Remove the old hero block, the separate "Photos" thumbnail grid, and the "No hero photo"/"No photos" blocks (the carousel subsumes them). Breadcrumbs + the header name/brand + "Add a name" cue stay.

## Components / files
- `src/features/items/ItemPhotoCarousel.tsx` *(new, client)* + test.
- `src/features/items/ItemMetadata.tsx` — affirming empty state + CTA (+ test).
- `src/app/collections/[id]/items/[itemNumber]/page.tsx` — two-column restructure; order photos; render carousel + Details card with the "Edit details" link; drop the hero/gallery blocks.
- **CREATE** `…/[itemNumber]/page.test.tsx` (does not exist) — see Testing.
- Reuse `PhotoViewControl`/`ImageViewer` (B), `getPhotoAssetUrlForPhoto`, `Card`, DESIGN tokens.

## Testing (TDD; runs in CI)
- **`ItemPhotoCarousel` (jsdom):** first photo shown; Next/Prev change the photo + update the `aria-live` position; **at the ends the nav buttons remain in the DOM with `aria-disabled`** (focus not lost); ≤6 photos → dots (each ≥44px) with `aria-current`; >6 → "N of M" counter, no dot row; single photo → no nav; empty → affirming add-photos CTA + no nav; ArrowRight/Left move; `PhotoViewControl` present + opens the viewer; slide keyed by `photo.id`.
- **`ItemMetadata` (jsdom):** empty → affirming add-prompt + CTA (assert NOT "No details added yet"); present → fields render.
- **CREATE `…/[itemNumber]/page.test.tsx`** (required deliverable — mirror an existing page.test): renders the carousel + the Details card + "Edit details" link; **asserts the old hero `h-96` block is gone** (the key regression).
- **e2e (`e2e/item-page.spec.ts`):** item with ≥2 photos — carousel shows a photo, Next advances (position text changes), the info/Details card renders, the view control opens the viewer; assert two columns at `lg`/desktop and stacked at phone (light touch). Intercept `**/photos/**/file*`.
- **a11y:** arrows/dots labelled, ≥44px, dots `aria-current`, `aria-live` position, keyboard arrows, visible focus, AA both themes; arrows carry the contrast backplate.
- **Screenshots:** item page (carousel + info) light + dark, tablet — required.

## Out of scope
- Reordering / setting hero from the carousel; bulk actions; persisted variant cache (purses-u1lr.4).

## Risks
- **Layout shift** — fixed `aspect-[4/3]` `bg-ground` frame.
- **No-swipe contract** — nav is buttons/dots/keyboard only; no drag-to-advance.
- **Index across refresh** — client `useState` persists (carousel instance not remounted by `router.refresh`); slides keyed by `photo.id`.
- **Hero semantics** — dropping the hero-centric *layout* keeps the `isHero` flag (cards still use it for covers); the carousel just shows all photos, hero first.
