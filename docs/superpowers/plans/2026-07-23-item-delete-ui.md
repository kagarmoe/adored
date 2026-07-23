# Item delete UI — plan (purses-v7gv)

Spec: `docs/superpowers/specs/2026-07-23-item-delete-ui-design.md` (rev 2, review folded).
Branch: `fix/item-delete-ui`. TDD per task: failing test first.

## Task 1 — `ItemDeleteControl`

Files: `src/features/items/ItemDeleteControl.tsx` (+ `.test.tsx`).

1. Failing tests (mirror `PhotoDeleteControl.test.tsx`, right-sized per spec):
   reveal→confirm; focus on `Keep` at reveal; confirm fires `DELETE /api/items/<id>`
   and pushes `…/items?removed=<id>`; one non-ok failure keeps state + error copy;
   double-tap fires one request. `useRouter` mocked.
2. Implement: clone of `PhotoDeleteControl` state machine; resting row (border-t
   separated, glyph + “Remove from collection”, `h-11`, `text-ink-soft`); confirm card
   copy per spec; on success `router.push(itemsHref + "?removed=" + itemId)` then
   `router.refresh()`.

## Task 2 — wire into the details page

Files: `src/app/collections/[id]/items/[itemNumber]/page.tsx` (+ its `page.test.tsx`).

1. Failing test: page renders the remove control for a member (true side only).
2. Rename `canDeletePhotos` → `canModify` in place; render `ItemDeleteControl` at the
   bottom of the Details card gated on `canModify`, passing `item.id` and the items href.

## Task 3 — undo notice on the items list

Files: `src/features/items/RemovedItemNotice.tsx` (+ `.test.tsx`),
`src/app/collections/[id]/items/page.tsx`.

1. Failing tests: renders on `removed` param; “Bring it back” POSTs
   `/api/items/<id>/restore`, strips the param (`router.replace`) and refreshes;
   failure shows retry line; “Done” strips the param.
2. Implement: `role="status"` quiet notice above the grid; items page reads
   `searchParams.removed` and renders it when present.

## Task 4 — e2e + gates + PR

1. `e2e/delete-item.spec.ts` (one tablet journey, mirrors `delete-photo.spec.ts`):
   open item → Remove → confirm → items list shows notice, item gone → Bring it back →
   item back.
2. Gates: `npm run lint`, `npm run test:ci`, `npm run build`, the new e2e +
   `e2e/item-page.spec.ts` locally.
3. `/sync-docs` (API.md untouched — routes unchanged; check doc-ownership mapping for
   `src/features/**`), `graphify update .`, screenshots (light+dark) via pr-screenshots,
   PR referencing purses-v7gv, per-task + whole-branch review already covered by the
   spec review + a final requesting-code-review pass.
