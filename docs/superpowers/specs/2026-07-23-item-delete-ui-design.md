# Item delete UI — design (purses-v7gv)

**Bead:** purses-v7gv — No UI path to delete an item.
**Date:** 2026-07-23 · **Rev:** 2 (adversarial review folded: UX 3, Craftsman 2, QA 3, Security 1 — no blockers)

## Problem

The backend has had item deletion for some time — `DELETE /api/items/[id]` (soft delete,
member-level), `POST /api/items/[id]/restore`, owner-only `purge` — but no UI reaches any
of it. The owner cannot remove an item (e.g. the six confirmed duplicate uploads in
production) without hand-editing the database.

## Decision

Add a **remove control to the item details page** (`/collections/[id]/items/[itemNumber]`),
calling the existing soft-delete `DELETE /api/items/[id]`, and an **undo notice on the
items list** riding the existing `POST /api/items/[id]/restore`. Nothing else: no
list-level delete, no archived-items view, no purge UI (deferred — see Out of scope).

## Design

### 1. `ItemDeleteControl` (new, `src/features/items/ItemDeleteControl.tsx`)

Clone of the `PhotoDeleteControl` interaction (two-step reveal → confirm; `inFlight`
double-tap guard; focus moves to the safe button on reveal).

**Clone-vs-extract (rule of three, decided):** this is the third `{confirming, busy,
error}` confirm flow (PhotoDeleteControl, DeleteAccountSection). We **clone**: a
`useConfirmAction` hook would have exactly one consumer unless the two existing, tested
controls are retrofitted — out of scope here; a one-consumer hook is premature
abstraction. Revisit if a fourth copy appears or when either sibling is next touched.

1. **Resting state:** its own block at the bottom of the Details card, separated by a
   `border-t border-hairline` rule with breathing room — **not** another bare text link
   stacked on "Manage photos" (review: identical signifiers, slip hazard). A quiet
   ≥44px (`h-11`) row: small outline glyph + `Remove from collection`, `text-ink-soft`,
   no red at rest.
2. **Confirming state:** inline card (same shape as the photo control):
   - Copy: **“Remove this item from the collection?”** — sub-line: “Its photos and story
     go with it. You can bring it back right after, if you change your mind.” (Honest:
     soft delete + the undo notice below make that true.)
   - Buttons: `Keep` (secondary, receives focus) · `Remove` (danger). Busy label
     `Removing…`.
   - Error: “That didn’t go through — the item is still here; try again.”
3. **On success:** `router.push` to `…/items?removed=<itemId>` then `router.refresh()`
   (refresh is the App Router cache-bust so the server-rendered list drops the item; the
   sibling photo control has no navigation, so this seam is new — covered by the e2e).

### 2. Undo notice on the items list (new, small client component)

The items list page reads `searchParams.removed`; when present, render a quiet
`role="status"` notice above the grid (aria-live announces it — this is also the AT
answer for the success transition; focus is not stolen):

- Copy: “Removed. It can come back if you change your mind.” + button **“Bring it back”**.
- “Bring it back” POSTs `/api/items/[id]/restore`, then `router.replace` to strip the
  query param and `router.refresh()`. Failure: “That didn’t go through — try again.”
- The notice renders only when the param is present; a stale/foreign id makes restore
  404 → show the failure line (no crash, no leak: the route enforces membership).
- Dismiss (“Done”) simply strips the param via `router.replace`.

### Authz / visibility

The DELETE route gates through `requireApiItemCapability(db, id, user.id, "items:write")`
(owner-or-curator — review confirmed this matches the page boolean byte-for-byte; bead
purses-3al is CLOSED, the route is properly enforced). The details page already computes
the same boolean (`canDeletePhotos`, page.tsx:34-36); rename to `canModify` in place and
reuse it. Note (QA): with no viewer tier, any renderer of this page is a member, so
`canModify` is **always true** today — the gate is defensive documentation of the API
boundary, and its false side gets **no page test** (an unreachable state; the mock world
required would be self-contradictory).

### Known interaction (decided, not hidden)

Soft-deleting an item that appears in a **finalized/shared sort result** makes it vanish
from that ranking (results pages drop unknown items). Decision: **allowed** — the act is
reversible (restore/undo), unlike purge, which correctly 409s on finalized results. A
gentle heads-up notice for this case is deferred (follow-up bead). Naming note: this
user-facing “Remove” is the reversible soft delete; the codebase’s “item removal
workflow” (purge + remove-from-sorts) is the permanent path — keep the vocabularies
distinct in copy and tests.

### Tone

“Remove”, never “delete”, in user-facing copy. One small decision at a time; reversal
offered at the moment it’s wanted (undo), no destructive surprises, no alarm styling at
rest.

## Tests

Right-sized to the cloned component’s real behaviors (QA review):

- **Unit — `ItemDeleteControl`:** reveal→confirm; focus lands on `Keep` on reveal;
  DELETE called with the item id and success pushes `…/items?removed=<id>`; **one**
  failure case (non-ok) keeps state + shows error copy; double-tap fires one request.
  (`useRouter` mocked — that’s a true boundary here.)
- **Unit — undo notice:** renders on `removed` param; “Bring it back” POSTs restore and
  strips the param; failure shows the retry line.
- **Page test:** control renders for a member (true side only — see Authz note).
- **e2e (one journey, tablet viewport):** mirrors `delete-photo.spec.ts` — open item →
  Remove → confirm → land on items list → item gone → “Bring it back” → item back.
  This is the only tier that can drive the push+refresh+server-list seam. (Existing
  `e2e/item-removal.spec.ts` is API-only purge coverage; unaffected.)
- **No new DB tier:** verified — `collection-items-routes.integration.test.ts` already
  crosses DELETE `/api/items/[id]` un-mocked (401/200-soft-delete/403), and restore is
  route-covered.

## Out of scope (deliberately)

- **Items-list-level remove** — known cost: bulk dupe cleanup means details-page
  round-trips per item (review F4); tracked as a follow-up bead, added if the single
  path proves tedious.
- **Archived-items / restore view** — restore beyond the immediate undo window needs its
  own surface; follow-up bead.
- **Owner purge UI** — permanent-delete needs a heavier confirm; separate design.
- **Finalized-result heads-up notice** — see Known interaction; follow-up bead.
