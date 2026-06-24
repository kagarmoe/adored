# Epic C — Gentle Affordances Cluster — Design Spec

**Date:** 2026-06-24
**Status:** Draft — pending adversarial spec review (hard gate before planning)
**Author:** autonomous Epic C session (ultracode)
**Beads:** purses-z76 (pause), purses-1an (Not Mine / set aside), purses-x5u (Not Yet / defer), purses-2f3f (session set-aside undo). Discovered latent bug: purses-4bhh.
**Governing authorities (in order):** [`TONE.md`](../../../TONE.md) (first-order) → [`PRODUCT.md`](../../../PRODUCT.md) → [`DESIGN.md`](../../../DESIGN.md). Wireframes are reference, not law.

## 1. Purpose

Four gentle affordances that let the grieving primary user step out of, set down, or defer the work without penalty — so reaching a calm, reversible state is always *easier than quitting the app*. They serve **TONE commitment 4** (unpressured, forgiving, reversible; "easy undo, no destructive surprises") and **commitment 3** (one thing at a time). None of them is a decision the person is pressed to make; each is an exit, a deferral, or a no-op-on-the-person's-belongings.

The litmus every screen here obeys: speak from the **person's side**. "Not mine to decide", "I'll come back to this", "Take a break" — never the machine's "skip / discard / abandon / 5 remaining".

## 2. Owner decisions (settled 2026-06-24)

Four product/UX forks were surfaced and answered:

1. **Not-Yet resurfacing → "End of pass, then persists."** A deferred item resurfaces after all non-deferred items in the current triage pass are decided, and stays deferred across future sessions until the person decides it or brings it back. No scheduler, no nag, no counts.
2. **Affordance placement → "Triage only."** Both "Not mine" and "Not yet" live on the triage screen, where a single item is in focus. Compare keeps its existing quiet `skip`/`tie` escape hatches; it gains nothing new. ("Not mine" is pre-triage by definition; by the time an item is in pairwise compare it is already in the ranking.)
3. **Set-aside retrieval → "Inline undo + quiet list."** Setting an item aside as "Not mine" offers a brief inline undo, AND a durable, count-free "Set aside" list to bring any item back later. (Not-Mine items never auto-return, so they need a durable recovery path.)
4. **Pause → "Mark paused + calm return."** An always-visible quiet "Take a break" flips the sort to `paused` and brings the person to a gentle screen where "Resume" waits exactly where they left off.

**Scoping decisions (mine, per ponytail + the cluster's literal beads):**

- The cluster reuses the **single existing session row** for pause / set-aside / undo. It does **not** add a "start a new sort after setting one aside" flow — that path is broken today by a pre-existing index bug (`purses-4bhh`, §3.3), which is **out of scope** and tracked separately. Undo (purses-2f3f) is the recovery path this cluster ships.
- Dispositions are **curator-scoped**, not collection-global: each user sorts independently (purses-t9l). One curator's "not mine" is not another's.
- We do **not** event-source dispositions (§4.2). The table is the state; reversal is a row delete.

## 3. Architecture facts (proven from source, not assumed)

### 3.1 The decision model is event-sourced; the triage queue reads a materialized map

`ScoringService.computePreferences` (`src/server/services/ScoringService.ts:57`) reconstructs every item's tier/score by replaying all `decision_events` across a curator's sessions, and **excludes any item with zero decisions** (`if (data.count === 0) continue`, L118). Results therefore never contain an item the person never touched.

The **triage queue**, however, does *not* replay events — it reads the materialized `preferences` table: the next item is `items.find(i => !preferencesByItemId.has(i.id))` (`triage/page.tsx:47`). An item leaves the triage queue once it has a preference row (created by `recalculatePreferences` after the first decision event, `decisions/route.ts:45`).

**Consequence for this cluster:** to remove a set-aside/deferred item from the *queue*, we must add a source the triage read path consults. Since a disposed item has no decision events, it is *already* absent from results — so **no scoring change is needed**. The new state governs queue eligibility only.

### 3.2 Session lifecycle already exists; two read-path constraints

- `SessionStatus = active | paused | completed | abandoned | deleted` (`src/types/domain.ts:95`). `pauseSession`/`resumeSession`/`completeSession`/`abandonSession` exist (`SessionService.ts:33-59`) with **no UI**. `PATCH /api/sessions/[id]` accepts `{status: active|paused|completed|abandoned}` (`sessions.ts:11`). → **Pause/resume need no new endpoint.**
- `softDelete` sets only `deletedAt` (+ `updatedAt`); it **leaves `status` untouched** (`SessionRepository.ts:134`). So a set-aside session keeps its prior status with `deletedAt` set. → **Restore = clear `deletedAt`** (status is already correct).
- **`findById` excludes soft-deleted** (`isNull(deletedAt)`, `SessionRepository.ts:51`). So `GET/PATCH/DELETE /api/sessions/[id]` all 404 on a set-aside session (`authorizeSession` → `getSessionOrNull` → `findById`). → **Undo cannot reuse those routes;** it needs a dedicated restore path with an include-deleted lookup.

### 3.3 `sessions_active_unique` over-enforces (pre-existing bug — OUT OF SCOPE, filed as purses-4bhh)

`drizzle/0000` creates `UNIQUE INDEX sessions_active_unique ON sessions(collection_id, curator_id)` with **no `WHERE` clause**, so a (collection, curator) pair can hold **at most one session row ever** (incl. soft-deleted). But `createSession` only guards on `findActive` (status=active, not deleted). After pause or set-aside, `findActive` is null and the landing offers "New Session" → `createSession` → insert collides on `sessions_active_unique` → 23505 (unretried) → **500**. The proper fix (partial index + guard + landing gating) is a lifecycle redesign with its own migration/postgres-review and is tracked in **purses-4bhh**. This cluster avoids the path entirely by reusing the single row.

## 4. Data model

### 4.1 New table: `item_dispositions`

```sql
CREATE TABLE "item_dispositions" (
  "id"            text PRIMARY KEY NOT NULL,
  "collection_id" text NOT NULL REFERENCES "collections"("id"),
  "curator_id"    text NOT NULL REFERENCES "user"("id"),
  "item_id"       text NOT NULL REFERENCES "items"("id"),
  "disposition"   text NOT NULL,            -- 'set_aside' | 'deferred'
  "created_at"    timestamp DEFAULT now() NOT NULL,
  "updated_at"    timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "item_dispositions_item_curator_unique"
  ON "item_dispositions"("item_id","curator_id");
CREATE INDEX "item_dispositions_collection_curator_idx"
  ON "item_dispositions"("collection_id","curator_id");
```

- **One disposition per item per curator** (`UNIQUE(item_id, curator_id)`). Setting aside / deferring is an **upsert** (`ON CONFLICT (item_id, curator_id) DO UPDATE SET disposition, updated_at`). Switching `deferred → set_aside` updates in place.
- The read path (`item_dispositions_collection_curator_idx`) answers "all of this curator's dispositions in this collection" in one indexed query → a `Map<itemId, disposition>`.
- **Reversal** ("bring back" / "retrieve") = `DELETE WHERE item_id = ? AND curator_id = ?`. Absence of a row = item is in the normal flow.
- Domain type: `Disposition = "set_aside" | "deferred"`; `ItemDisposition { id, collectionId, curatorId, itemId, disposition, createdAt, updatedAt }`. A literal union makes an illegal disposition unrepresentable at the construction sites.

**Why a table, not decision events** (§2 decision): the triage queue reads a materialized map, not replayed events. Event-sourcing dispositions would force the triage read path to derive current state from a second event stream with no benefit — we need reversibility (a row delete), not a disposition history. This mirrors the existing materialized `preferences` snapshot pattern. `// ponytail: the table IS the state; add an event log only if a disposition timeline is ever a product requirement.`

### 4.2 No `session_id` column

A disposition outlives the session that created it (Not-Mine is durable; deferred persists across sessions per fork 1). Resurfacing logic ("show deferred after non-deferred are done") is computed from the queue, not from which session deferred the item. `// ponytail: omit session_id until a feature needs per-session disposition history.`

### 4.3 Migration safety (postgres-review lens)

- `CREATE TABLE` + indexes on a **brand-new empty table**: no lock on existing data, no `CREATE INDEX CONCURRENTLY` needed (concurrent build only matters for indexes on populated tables).
- FKs reference existing `collections` / `user` / `items`. Down migration: `DROP TABLE item_dispositions`. Fully reversible.
- **Erasure completeness (data-erasure-completeness memory):** `item_dispositions` references `user` and `collections`, so it MUST be enumerated in account deletion and collection purge or those deletes hit FK violations / leave orphans. Add `deleteByCurator(curatorId)` and `deleteByCollection(collectionId)` to the disposition repo and wire them into `AccountDeletionService` and the collection-purge service, with a DB-integration test asserting dispositions are gone after each. (Same precedent as sessions/decision_events.)

## 5. Feature designs

### 5.1 Triage queue eligibility (the shared core)

Extract a pure function (replacing the inline `items.find` at `triage/page.tsx:47`):

```ts
// selectTriageItem(items, preferencesByItemId, dispositionByItemId)
//  → { item, showingDeferred, inPlayCount, decidedCount }
const untriaged = items.filter(i => !preferencesByItemId.has(i.id));
const candidates = untriaged.filter(i => dispositionByItemId.get(i.id) !== "set_aside");
const active   = candidates.filter(i => dispositionByItemId.get(i.id) !== "deferred");
const deferred = candidates.filter(i => dispositionByItemId.get(i.id) === "deferred");
const item = active[0] ?? deferred[0] ?? null;           // deferred resurface only when active is empty
const showingDeferred = active.length === 0 && deferred.length > 0;
```

- **set_aside** items are removed from the queue entirely (and, having no decision events, are already absent from results/pairing).
- **deferred** items sort to the **end**: surfaced only once every non-deferred untriaged item is decided (fork 1), and they persist across sessions until decided or brought back.
- `showingDeferred` drives the calm "patient waiting" treatment (§5.3).
- **Progress denominator (tone fix):** the existing `triaged of totalItems` bar (`triage/page.tsx:53,72`) must exclude `set_aside` items from the denominator, so setting something aside never inflates "remaining" or makes the bar regress. Deferred items remain in the denominator (still the person's to decide). We do **not** add any new count UI (TONE 4 forbids backlog framing); we only correct the existing denominator.

This function is the money logic → exhaustively unit-tested (set_aside excluded; deferred deferred-to-end; deferred resurfaces when active empty; null when all done; `showingDeferred` correctness; mixed sets; regression for each fork).

### 5.2 "Not mine — set aside" (purses-1an)

Pre-triage gate rendered as a **quiet secondary action** on the triage screen, visually separated from the four tier buttons (which stay the primary row). Selecting it does **not** record a triage decision — it upserts `disposition='set_aside'` and the item leaves the flow.

- **Copy:** action "Not mine" (sub: "set aside — not mine to decide"). Never "discard / skip / trash". After: a brief inline notice "Set aside · **Undo**" (Undo = delete the disposition). The item card crossfades out to the next (reduced-motion → instant).
- **Durable retrieval (fork 3):** a count-free "Set aside" list, reachable by a quiet link from the triage screen / sort landing (label "Set aside", no number). Each row = item photo + name + a gentle "Bring back" (delete disposition → re-enters the queue). Tone: patient holding, **not** an inbox; no counts, no "X items".
- **Excluded everywhere:** never in pairing (`PairingService` candidate filter), never in results (already true — no events).

### 5.3 "Not yet — defer" (purses-x5u) + the patient-waiting pattern

A second quiet secondary action on the triage screen: "Not yet" (sub: "I'll come back to this") → upsert `disposition='deferred'`. The item moves to the end of the pass (§5.1).

- **Resurfacing (fork 1):** when `active` is empty and `deferred` remain, the triage screen wears a calm **"patient waiting"** skin: a gentle headline ("Ready when you are") and unhurried framing — **not** "X left", not an inbox bottom, and explicitly **never the word "resting place"** (funereal; per the purses-x5u refinement). The four tier buttons + "Not mine" remain; "Not yet" on an already-deferred item is a no-op (kept idempotent).
- **DESIGN.md gap:** DESIGN.md has no patient-waiting pattern yet (flagged in the x5u refinement / purses-agp). This cluster introduces it, so PR1 adds a short "Patient waiting (Not yet)" entry to DESIGN.md via `/sync-docs` (tokens: cool-blue benign-state chip, ink-soft copy, the `--ease-gentle`/reduced-motion crossfade). No new tokens — reuse the existing "benign-state" cool blues already sanctioned in DESIGN.md §2.

### 5.4 "I need a moment" pause (purses-z76)

- **Always-visible quiet control** in the sort chrome on **triage and compare** screens — a low-emphasis "Take a break" reachable without hunting (easier than closing the app). Tap → `PATCH /api/sessions/[id] {status:"paused"}` → route to a **calm pause screen**.
- **Calm screen:** gentle, reduced-motion-friendly; copy "Your sort is safe — come back whenever you're ready." A single primary "Resume" + a quiet "Back to {collection}". No timer, no progress, no count (TONE 4: no urgency/deadline).
- **Landing reflects paused:** generalize the landing's `activeSession` finder to a `currentSession = sessions.find(s => s.status === 'active' || s.status === 'paused')` (`sort/page.tsx:25`), labelled "Paused — resume when ready" when paused. Resume → `PATCH {status:"active"}` then into the sort, which (event-sourced) lands on the next undecided item automatically. State preservation is free — every choice is already a committed event.
- No transient state is lost by pausing; the value is the calm exit + a landing that says "your sort is waiting", not a generic list row.

### 5.5 Undo / confirmation after setting a SESSION aside (purses-2f3f)

Today `AbandonSessionButton` soft-deletes then `router.refresh()` unmounts with no feedback. Restructure into a client island that survives the refresh:

- **State machine:** `idle (current-session card)` → `confirming` → `setAside (notice: "Set aside — you can bring it back · Undo")`. On set-aside success, the island stays mounted at a stable position and shows the undo notice; `router.refresh()` updates the rest of the page. **No auto-dismiss timer** (a countdown reads as a deadline — TONE 4); the notice persists on the page until Undo or navigation.
- **Undo → restore:** new `POST /api/sessions/[id]/restore`. Because `findById` excludes soft-deleted, the route uses a new repo `findByIdIncludingDeleted` + `restore` (clear `deletedAt`), then re-checks authorization (collection access + `curatorId === userId`) **on the include-deleted row** — IDOR-critical: a non-curator must not restore another's session.
- Durable session retrieval (beyond the on-page undo) is **out of scope** — the bead asks only for confirmation + undo; note as a possible follow-up. (Item-level durable retrieval IS in scope, §5.2, because Not-Mine items never auto-return.)

## 6. API surface

| Method | Route | Body / params | Auth | Notes |
|---|---|---|---|---|
| POST | `/api/collections/[id]/dispositions` | `{itemId, disposition}` | `requireApiCollectionAccess` + curator==user | Upsert. `curatorId`/`collectionId` derived server-side (never from body). Validate `itemId` belongs to the collection (belongs-to-parent). Zod-validated `disposition` enum. |
| GET | `/api/collections/[id]/dispositions?disposition=set_aside` | — | same | Curator's own dispositions only. Powers the "Set aside" list. |
| DELETE | `/api/collections/[id]/dispositions/[itemId]` | — | same | Bring back (delete the curator's row for that item). Idempotent (absent → 200/no-op or 404; choose 200 idempotent). |
| PATCH | `/api/sessions/[id]` | `{status:"paused"\|"active"}` | existing `authorizeSession` | **Existing route** — pause/resume. No change. |
| POST | `/api/sessions/[id]/restore` | — | include-deleted lookup + collection access + curator==user | **New.** Undo session set-aside. Distinct auth (existing `authorizeSession` 404s on deleted). |

All disposition writes derive `curatorId` from the authenticated session and **never** trust a client-supplied curator/owner — the IDOR chokepoint mirrors `decisions/route.ts` and the `api-route-authz-pattern` memory.

## 7. Visual / tone treatment

- **Tokens (DESIGN.md, no new tokens):** the two quiet triage actions use ghost/secondary styling (transparent, ink/ink-soft) — deliberately below the four tier buttons in emphasis (precedent: `CompareChoice` "Escape hatches, deliberately quiet"). Benign-state chips use the sanctioned cool blues; **no semantic/safety hue** (no red/amber) — set-aside and defer are not errors or dangers (DESIGN.md "Brand never speaks Danger"). Touch targets ≥44px (h-11). Colour is never the sole signal — each affordance pairs label + icon.
- **Motion:** crossfade to the next item via `--ease-gentle`/`--duration-reveal`; `prefers-reduced-motion` already collapses to instant globally (`globals.css:250`). Nothing snaps for attention.
- **Copy register (person's side, TONE litmus):** "Not mine" / "I'll come back to this" / "Ready when you are" / "Take a break" / "Your sort is safe" / "Bring it back". Forbidden: discard, trash, skip, abandon, "X remaining", streak/deadline language.
- **A11y (WCAG 2.1 AA):** AA contrast both themes (contrast.test.ts already gates pairings); focus-visible rings (focus-visible-migrate-all-pseudos memory); the undo/notice regions use `role="status"` live regions; confirm dialogs move focus to the safe default (precedent: `AbandonSessionButton` cancelRef).

## 8. Testing strategy

YAGNI does not apply to tests (global override). Every branch/path gets a real test; the important seams cross real layers un-mocked.

- **Unit (vitest/jsdom):** `selectTriageItem` pure function — exhaustive (§5.1). Component tests: triage screen renders the two quiet actions + calls the disposition API; "Set aside" list renders + bring-back; `SetAsideWithUndo` state machine; pause control + calm screen; deferred "patient waiting" skin; progress-denominator excludes set_aside.
- **DB integration (`src/lib/db/*.integration.test.ts`, `RUN_DB_TESTS=1`, runs in CI `db-tests` job):**
  - Disposition repo upsert/switch/delete + `UNIQUE(item_id,curator_id)`.
  - Erasure: dispositions gone after account-deletion and collection-purge (§4.3).
  - **Un-mocked route→repo→Postgres**: dispose POST creates the row; set-aside item never appears in triage eligibility or results; deferred resurfaces at end; **IDOR** — curator B cannot dispose/bring-back/restore curator A's items/session (403/404).
  - Restore: set-aside session → restore re-activates (deletedAt null) and authorizes correctly.
- **e2e (Playwright, `e2e/**`, selective `ui` filter fires on `src/app/**`):** tablet+phone+desktop via `e2e/fixtures` auth (no `/login` UI driving). Flows: Not-mine set aside → gone → undo brings back; Not-yet defer → goes to end → resurfaces with calm treatment; pause → calm screen → resume; session set-aside → undo restores. Light+dark screenshots for each PR (pr-screenshots).
- **CI placement (coverage-merged-floor / e2e-selective-required memories):** un-mocked seam tests under `src/lib/db/`; e2e under `e2e/**`; at least one test per PR crosses the real layers un-mocked.

## 9. Decomposition & PR sequencing

Four coherent PRs, each one logical change with full gates (build / test:ci / lint / auth:verify / `RUN_DB_TESTS=1` test:db) + selective e2e + light/dark screenshots; whole-branch adversarial review weighted to the lenses touched; merge when green (rebase if behind).

| PR | Branch | Scope | Primary review lenses |
|----|--------|-------|----------------------|
| **PR1** | `epicC-dispositions-not-yet` | `item_dispositions` table + migration + repo (+ erasure wiring) + dispositions API + `selectTriageItem` + **"Not yet"** affordance + end-of-pass resurfacing + patient-waiting skin + DESIGN.md pattern entry. | postgres-review, system-design, security (IDOR), UX, a11y, QA |
| **PR2** | `epicC-not-mine` | **"Not mine"** set-aside affordance (writes `set_aside`) + inline undo + durable "Set aside" list + bring-back. Builds on PR1's table/API/eligibility. | security (IDOR), UX, a11y, craftsman, QA |
| **PR3** | `epicC-pause` | "Take a break" control (triage+compare) + calm pause screen + pause/resume wiring + landing reflects `paused`. | UX, a11y, system-design, craftsman |
| **PR4** | `epicC-session-undo` | Session set-aside confirmation + undo + `POST /restore` + `findByIdIncludingDeleted`/`restore` repo + `SetAsideWithUndo` island. | security (IDOR), system-design, UX, QA |

Order: PR1 → PR2 (depends on PR1). PR3, PR4 independent (any order after). PR3+PR4 may merge into one "session lifecycle UX" PR if both prove small at planning time.

## 10. Out of scope / follow-ups

- **purses-4bhh** — `sessions_active_unique` over-enforcement (§3.3). Proper fix is a partial-index lifecycle redesign; this cluster avoids the path.
- **Durable session retrieval** beyond the on-page undo (§5.5) — only if a need emerges.
- **The existing `triaged of totalItems` count framing** itself may be borderline TONE 4; we only correct its denominator here, not relitigate the pattern. File separately if the owner wants it revisited.
- **"Not mine" / "Not yet" in compare** — explicitly deferred by fork 2 (triage only).

## 11. Risks & open questions

- **Pairing exclusion belt-and-suspenders:** disposed items have no preferences so `PairingService`/`pairwise-selection` should already skip them; we add an explicit candidate filter + test rather than rely on the absence of a preference row.
- **Idempotency:** "Not yet" on an already-deferred item, "bring back" on an absent disposition, and double-tap on set-aside must all be safe no-ops (upsert / idempotent delete / in-flight guard precedent in `AbandonSessionButton`).
- **Undo island survival:** the set-aside undo notice must survive `router.refresh()` — verified by keeping the island mounted at a stable tree position (not conditionally unmounted with the card).
```
