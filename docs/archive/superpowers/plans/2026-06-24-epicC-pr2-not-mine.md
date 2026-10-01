# Epic C · PR2 — "Not Mine" (set aside) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Ship the "Not mine — set aside" affordance in triage: a single frictionless tap that removes an item from the flow (writes `disposition='set_aside'`), an inline undo that survives the page refresh, and a durable count-free "Set aside" list to bring any item back later.

**Architecture:** All data/API/selectors exist from PR1 (`item_dispositions`, `POST/GET/DELETE /api/collections/[id]/dispositions`, `selectTriageItem` drops `set_aside`, `selectNextPair`/results already exclude it). PR2 is UI: a `SetAsideControl` client island (non-keyed, so its inline-undo state survives `router.refresh()`), a `/sort/set-aside` list page, and a `BringBackControl`.

**Tech Stack:** Next.js App Router (Server Components + client islands), Tailwind tokens, Vitest jsdom + Playwright.

**Spec:** `docs/superpowers/specs/2026-06-24-gentle-affordances-design.md` §5.2 + §9 (PR2 row).

## Global Constraints

- **Authorities:** TONE.md (first-order) → PRODUCT.md → DESIGN.md. Person-side copy: "Not mine", "set aside — not mine to decide", "Bring back". **Forbidden:** discard/trash/skip/abandon, "X remaining", any count of the set-aside pile.
- **purses-1an: frictionless.** Set-aside is a SINGLE tap, **no confirmation**, no metadata. The item simply leaves.
- **`collectionId` passed to disposition APIs is the ULID `collection.id`, never the slug** (API asserts `item.collectionId === params.id`).
- **No new tokens.** Quiet ghost action below the tier row (same demoted sub-row as "Not yet"). Inline undo + list use `role="status"`/live regions where state changes. ≥44px (h-11), focus-visible, reduced-motion, AA both themes, colour never the sole signal.
- **Inline undo has NO auto-dismiss timer** (a countdown reads as a deadline — TONE 4); it persists until undo, navigation, or the next set-aside replaces it.
- Tests run in CI (jsdom unit under `src/**`, e2e under `e2e/**`).

---

### Task 1: `SetAsideControl` island ("Not mine" + persistent inline undo) + triage wiring

**Files:**
- Create: `src/features/sorting/SetAsideControl.tsx`
- Test: `src/features/sorting/SetAsideControl.test.tsx`
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/triage/page.tsx` (render it in the quiet sub-row beside `DeferControl`; pass `collectionId={collection.id}` (ULID), `itemId`, `itemName`)

**Interfaces:**
- Produces: `SetAsideControl({ collectionId, itemId, itemName }: { collectionId: string; itemId: string; itemName: string | null })` — `"use client"`.
- Behavior: renders a ghost "Not mine" button (single tap → `POST /api/collections/${collectionId}/dispositions` `{itemId, disposition:"set_aside"}` → on success `setUndo({itemId, name})` then `router.refresh()`). It also renders a persistent `role="status"` undo notice when `undo` state is set: "Set aside — *{name}* · **Bring back**". "Bring back" → `DELETE /api/collections/${collectionId}/dispositions/${undo.itemId}` → clear `undo` + `router.refresh()`. In-flight guard (mirror `DeferControl`). The component is rendered **un-keyed** in the page so its `undo` state survives `router.refresh()` (the next item arrives via props; the undo notice from the prior set-aside persists). Setting aside a second item replaces `undo` with the new one.

- [ ] **Step 1: Failing component test** `SetAsideControl.test.tsx` (`// @vitest-environment jsdom`; mock `fetch` + `next/navigation` useRouter):
  - clicking "Not mine" POSTs `{itemId, disposition:"set_aside"}` to `/api/collections/{cid}/dispositions` and calls `router.refresh()`.
  - after a successful set-aside, a `role="status"` notice with "Bring back" appears; clicking "Bring back" DELETEs `/api/collections/{cid}/dispositions/{itemId}` and calls `router.refresh()` again.
  - the undo notice persists across a props change of `itemId` (simulate by re-rendering with a new itemId — the notice for the prior item is still shown).

```ts
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { SetAsideControl } from "./SetAsideControl";

describe("SetAsideControl", () => {
  beforeEach(() => { refresh.mockClear(); global.fetch = vi.fn().mockResolvedValue({ ok: true }); });
  it("sets aside then offers a persistent bring-back", async () => {
    const { rerender } = render(<SetAsideControl collectionId="c1" itemId="i1" itemName="A bag" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const post = (global.fetch as any).mock.calls[0];
    expect(post[0]).toBe("/api/collections/c1/dispositions");
    expect(JSON.parse(post[1].body)).toEqual({ itemId: "i1", disposition: "set_aside" });
    // undo notice present and survives the next item arriving via props
    rerender(<SetAsideControl collectionId="c1" itemId="i2" itemName="Another bag" />);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/bring back/i);
    fireEvent.click(screen.getByRole("button", { name: /bring back/i }));
    await waitFor(() => expect((global.fetch as any)).toHaveBeenCalledWith("/api/collections/c1/dispositions/i1", expect.objectContaining({ method: "DELETE" })));
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/features/sorting/SetAsideControl.test.tsx`.
- [ ] **Step 3: Implement `SetAsideControl.tsx`** — ghost `Button` "Not mine" (sub via aria-label/title "set aside — not mine to decide"), in-flight guard like `DeferControl`; `const [undo, setUndo] = useState<{itemId:string; name:string|null}|null>(null)`; on set-aside success `setUndo({itemId, name:itemName})` + `router.refresh()`; render the `role="status"` notice with "Bring back" when `undo`; bring-back DELETEs + `setUndo(null)` + refresh. Gentle failure copy on error.
- [ ] **Step 4: Wire `triage/page.tsx`** — in the existing quiet sub-row (the `border-t border-hairline pt-3` block that holds `DeferControl`), add `<SetAsideControl collectionId={collection.id} itemId={item.id} itemName={item.name} />`. Keep "Not yet" and "Not mine" as two distinct quiet actions; ensure the sub-row still reads as demoted vs the four tiers. Do NOT key `SetAsideControl` by `item.id` (the undo must survive refresh).
- [ ] **Step 5: Run unit + the triage page test** — `npx vitest run src/features/sorting/SetAsideControl.test.tsx "src/app/collections/[id]/sort/[sessionNumber]/triage/page.test.tsx"`; update the triage page test to assert the "Not mine" action renders. Then `npm run build` + `npm run lint`.
- [ ] **Step 6: Commit** — `feat(triage): "Not mine" set-aside affordance + persistent inline undo (Epic C PR2)`.

---

### Task 2: "Set aside" list page + `BringBackControl` + quiet link

**Files:**
- Create: `src/app/collections/[id]/sort/set-aside/page.tsx` (Server Component)
- Create: `src/features/sorting/BringBackControl.tsx` (client)
- Test: `src/features/sorting/BringBackControl.test.tsx`; `src/lib/db/set-aside-list.integration.test.ts` (un-mocked data path)
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/triage/page.tsx` (a quiet "Set aside" link — no count — to the list)

**Interfaces:**
- `BringBackControl({ collectionId, itemId }: { collectionId: string; itemId: string })` — ghost "Bring back" → `DELETE /api/collections/${collectionId}/dispositions/${itemId}` → `router.refresh()`. In-flight guard.
- The page: auth via `requireCollectionAccess` (page-level, mirrors triage/page.tsx); fetch the curator's `set_aside` dispositions via `DispositionController.fromDb(db).listDispositions(collection.id, userId, "set_aside")`; load the item details (`ItemController`) + cover photos (`PhotoController.findCoverPhotosByItemIds`) for those itemIds; render a **count-free** calm list (each row: cover + name + `BringBackControl`), with a gentle empty state ("Nothing set aside"). No counts, no "N items".

- [ ] **Step 1: Failing un-mocked integration test** `src/lib/db/set-aside-list.integration.test.ts` (mirror an existing page/route integration test header; mock `@/lib/auth` + `@/lib/db`): seed a collection + 2 items + a session (curator); set aside item A (`ItemDispositionRepository.upsert set_aside`); GET the set-aside page (render the Server Component, or assert the data path: `DispositionController.listDispositions(collectionId, curatorId, "set_aside")` returns only A; the page would list A and not B). Assert item B (not set aside) is absent. Assert a second curator's GET sees none of A's.

  > If rendering the Server Component in a node test is awkward, assert the page's data-assembly path directly (the controllers it composes) un-mocked against pg — that's the seam that matters.

- [ ] **Step 2: Run → FAIL** — `npm run test:db -- src/lib/db/set-aside-list.integration.test.ts`.
- [ ] **Step 3: Implement `BringBackControl.tsx`** (ghost button, DELETE + refresh, in-flight guard) + its jsdom test (clicking "Bring back" DELETEs the right URL + refreshes).
- [ ] **Step 4: Implement the `set-aside/page.tsx`** — auth, fetch set_aside dispositions + item details + covers, render the count-free list + empty state. Use the slug for nav/breadcrumbs but `collection.id` (ULID) for the disposition API the `BringBackControl` calls.
- [ ] **Step 5: Add the quiet link** in `triage/page.tsx` — a low-emphasis "Set aside" link (NO count) to `/collections/${collection.slug ?? collection.id}/sort/set-aside`. Place it unobtrusively (e.g. near the breadcrumb area or below the sub-row), not competing with the decision.
- [ ] **Step 6: Run** — `npm run test:db -- src/lib/db/set-aside-list.integration.test.ts`, `npx vitest run src/features/sorting/BringBackControl.test.tsx`, then `npm run build` + `npm run lint`.
- [ ] **Step 7: Commit** — `feat(triage): durable "Set aside" list + bring-back (Epic C PR2)`.

---

### Task 3: e2e — set-aside flow (inline undo + list bring-back) + screenshots

**Files:**
- Create: `e2e/not-mine-set-aside.spec.ts`
- Modify: `e2e/screenshots/capture.ts` (add a "set-aside list" surface)

- [ ] **Step 1: Write the e2e** (tablet+phone+desktop; storageState auth; `**/photos/**/file*` intercept). Seed `seedJourneyScenario(ownerId, 3)`. Flow: open triage → tap "Not mine" on the focused item → assert it LEFT the flow (a different item focuses) → assert the inline "Bring back" notice is present → tap "Bring back" → assert the item returns to the flow. Second flow: set aside an item → open the "Set aside" list (via the quiet link) → assert the item is listed → "Bring back" from the list → assert the list no longer shows it. Assert no count/backlog string in either surface.
- [ ] **Step 2: Run e2e** — `npx playwright test e2e/not-mine-set-aside.spec.ts` (3 projects). Then run the FULL e2e suite (`npx playwright test`) to catch any triage-copy/layout regression (the `e2e-run-full-suite-after-copy-change` lesson).
- [ ] **Step 3: Add a screenshot surface** for the "Set aside" list (seed a collection with a set-aside item) in `capture.ts`; capture light+dark for the PR.
- [ ] **Step 4: Commit** — `test(e2e): Not-mine set-aside + bring-back across viewports (Epic C PR2)`.

---

## Final gate (before PR2)
- [ ] build · test:ci · lint · auth:verify · `RUN_DB_TESTS=1` test:db · full e2e (3 viewports) — all green
- [ ] `/sync-docs` (API.md already covers the routes; note set_aside is now UI-wired) + `/graphify --update`
- [ ] Whole-branch `adversarial-review` (lenses: UX/TONE, a11y, system-design for the undo-survives-refresh island, QA) → fold → re-verify
- [ ] Light+dark screenshots (triage with both quiet actions; the "Set aside" list) embedded in the PR body
- [ ] Merge when green → `/close-out` (close purses-1an)

## Self-review (spec coverage)
§5.2 "Not mine" set-aside (frictionless, writes set_aside) → Task 1. Inline undo (survives refresh, no timer) → Task 1. Durable count-free "Set aside" list + bring-back (fork 3) → Task 2. Pairing/results exclusion + 409 + clear-on-triage → already shipped in PR1 (set_aside path). e2e + screenshots → Task 3.
