# Epic C — Gentle Affordances Cluster — Design Spec

**Date:** 2026-06-24
**Status:** Reviewed (7-persona adversarial review folded 2026-06-24) — ready for planning
**Author:** autonomous Epic C session (ultracode)
**Beads:** purses-z76 (pause), purses-1an (Not Mine / set aside), purses-x5u (Not Yet / defer), purses-2f3f (session set-aside undo). Discovered latent bug: purses-4bhh.
**Governing authorities (in order):** [`TONE.md`](../../../TONE.md) (first-order) → [`PRODUCT.md`](../../../PRODUCT.md) → [`DESIGN.md`](../../../DESIGN.md). Wireframes are reference, not law.

## 0. Review folds (changelog)

A 7-persona adversarial review (QA, Security, Architect, Data/Persistence, Craftsman, Graphic Design, UX) ran against the draft. Verdict: **BLOCK** (one critical) + CONCERNS. All findings verified against source and folded:

- **[BLOCK→fixed] Disposed items WERE eligible for pairwise compare.** The draft claimed "no decision events ⟹ already absent from pairing." True for *results* (`ScoringService` drops `count===0`), **false for pairing**: the live `selectNextPair` (`src/lib/pairwise-selection.ts:19-23`) scores a no-preference item as `?? 0` and keeps it a candidate. The pairing exclusion is **load-bearing**, not belt-and-suspenders — compare now filters disposed items explicitly (§3.1, §5.2, §11).
- **[HIGH→fixed] Illegal state: disposition on an already-triaged item.** The "Not-Mine is pre-triage" invariant was assumed, not enforced. Now enforced at the boundary: the disposition write **409s if a preference row exists**, and recording a triage decision **clears** any disposition for that item — making `disposed ⟺ untriaged` real, which is what keeps "no scoring change" honest (§2, §5.1, §6).
- **[HIGH→fixed] Cross-collection IDOR write.** Collection-only auth let a member of X write a disposition keyed to an item in Y. Now routed through the existing item-capability guard (resolves `itemId → item.collectionId → capability`) **plus** an explicit `item.collectionId === params.id` check (404 on mismatch) (§6).
- **[HIGH→fixed] Erasure omits the per-item purge vector.** `ItemPurgeService.purge()` hard-deletes a single item; the disposition FK has no cascade → add `deleteByItem` and wire it into item purge, alongside curator/collection erasure. Three vectors now enumerated (§4.3).
- **[HIGH→fixed] AA: ink-soft on a cool-blue chip fails in light theme** (Aqua 4.14 / Sky 3.22 / Cornflower 2.38 / Periwinkle 2.99, all < 4.5). Chip text is **full ink** (passes 6.8–11.9 both themes); ink-soft only on surface. The shipped chip pairing is **added to `contrast.test.ts`** so the gate (not the screenshot) proves AA (§5.3, §7, §8).
- **[HIGH→fixed] Count/backlog framing.** The triage screen's inherited `{triaged} of {totalItems}` + filling-to-100% bar is exactly the "5 still undecided" framing purses-x5u forbids. Replaced with a ceiling-free, person-side cue (count what you *did*, never what's *left*) — resolved inside the cluster, not deferred (§5.1, §7).
- **[MED→fixed] Pause raises purses-4bhh exposure.** Pause makes "a non-active but undeleted session" the normal resting state, and the landing's "New Session" button is unconditional (`sort/page.tsx:38`) → after pausing, the natural next click 500s. Cheap in-scope mitigation: gate/redirect "New Session" when a current (active/paused) session exists (§5.4). The index fix itself stays in purses-4bhh.
- **[MED→folded] Co-member IDOR tests + idempotency no-ops + undo-survives-refresh** added to §8 (the distinctive curator-B-is-a-member case; DELETE-absent=200; defer-on-deferred; double-tap; e2e asserts the undo control is still clickable *after* `router.refresh()` settles).
- **[MED→folded] Six-affordance layout contract** and the existing **machine-side copy** ("Triage" / "Assign … to a preference bucket") fixed in the same PR (§5.2, §5.4, §7).
- **Confirmed clean (reviewer-dropped):** the new table is justified (reuse alternatives break an invariant); `selectTriageItem` extraction is correct laziness; Peak-End recovery is affirming; colour-never-sole-signal + reduced-motion honoured.
- **Note:** draft file:line citations were flagged as approximate — re-verify exact lines at implementation; they drift.

## 1. Purpose

Four gentle affordances that let the grieving primary user step out of, set down, or defer the work without penalty — so reaching a calm, reversible state is always *easier than quitting the app*. They serve **TONE commitment 4** (unpressured, forgiving, reversible; "easy undo, no destructive surprises") and **commitment 3** (one thing at a time). None is a decision the person is pressed to make; each is an exit, a deferral, or a no-op on belongings that were never theirs to weigh.

The litmus every screen here obeys: speak from the **person's side**. "Not mine to decide", "I'll come back to this", "Take a break" — never the machine's "skip / discard / abandon / 5 remaining".

## 2. Owner decisions & settled invariants

**Owner forks (settled 2026-06-24):**

1. **Not-Yet resurfacing → "End of pass, then persists."** A deferred item resurfaces after all non-deferred items in the current pass are decided, and persists across future sessions until decided or brought back. No scheduler, no nag, no counts.
2. **Affordance placement → "Triage only."** Both "Not mine" and "Not yet" live on the triage screen. Compare keeps its existing quiet `skip`/`tie` escape hatches.
3. **Set-aside retrieval → "Inline undo + quiet list."** Inline undo immediately, plus a durable count-free "Set aside" list to bring any item back later (Not-Mine never auto-returns).
4. **Pause → "Mark paused + calm return."** An always-visible quiet "Take a break" flips the sort to `paused` and returns the person to a gentle screen where "Resume" waits.

**Settled invariants (folded from review):**

- **`disposed ⟺ untriaged`.** A disposition (`set_aside` | `deferred`) attaches **only** to an item with no preference row for that curator. Enforced two ways: the write **409s** if a preference exists; recording a triage decision **deletes** any disposition for that item. This is the load-bearing precondition that makes "disposed items have no decision events ⟹ absent from results" true (so `ScoringService` needs no change), and it forbids the contradictory "ranked in results AND set aside" state.
- **Dispositions are curator-scoped**, never collection-global (purses-t9l: each user sorts independently). `curatorId` is always derived server-side from the session, never from the request body.
- **Pairing exclusion is load-bearing** (§3.1): compare must filter disposed items; it is not made safe by event-absence.
- **Scope:** the cluster reuses the single existing session row for pause/set-aside/undo and does **not** add a "start a new sort after setting one aside" flow (broken by purses-4bhh). It *does* gate the landing's "New Session" button so pause doesn't detonate 4bhh (§5.4). We do **not** event-source dispositions — the table is the state; reversal is a row delete.

## 3. Architecture facts (proven from source)

### 3.1 Event-sourced results; materialized triage queue; **pairing is NOT auto-safe**

`ScoringService.computePreferences` replays `decision_events` and **excludes items with zero decisions** — so a disposed (untriaged) item is absent from **results** with no scoring change.

The **triage queue** reads the materialized `preferences` map (`triage/page.tsx`: `items.find(i => !preferencesByItemId.has(i.id))`).

**Pairing is the exception that the draft got wrong.** The live compare path is `selectNextPair` (`src/lib/pairwise-selection.ts`), called from `compare/page.tsx` with **all** collection items; it scores a no-preference item as `?? 0` and keeps it eligible. So a disposed item *would* reappear in "Which do you love more?" unless explicitly filtered. **Required:** `compare/page.tsx` fetches the curator's dispositions and removes `set_aside` **and** `deferred` items from the `items` it passes to `selectNextPair` (or `selectNextPair` takes a `dispositionByItemId` and skips them). A DB-integration test asserts a disposed item is never returned as `itemA`/`itemB`.

### 3.2 Session lifecycle exists; two read-path constraints

- `SessionStatus = active | paused | completed | abandoned | deleted`. `pause/resume` exist in `SessionService` with no UI; `PATCH /api/sessions/[id]` accepts `status`. → pause/resume need no new endpoint.
- `softDelete` sets only `deletedAt` (leaves `status`). → restore = clear `deletedAt`.
- `findById` excludes soft-deleted (`isNull(deletedAt)`). → `GET/PATCH/DELETE /api/sessions/[id]` all 404 on a set-aside session; **undo needs a dedicated restore path** with an include-deleted lookup.

### 3.3 `sessions_active_unique` over-enforces (purses-4bhh — fix OUT OF SCOPE, exposure mitigated here)

`UNIQUE(collection_id, curator_id)` with no `WHERE` clause ⟹ one session row per (collection, curator) ever; `createSession` guards only on `findActive` (status=active). After pause/set-aside, `findActive` is null and "New Session" → insert collides → 23505 (the retry loop only retries the `sessions_collection_number` conflict) → **500**. The proper fix is a partial index + an aligned create guard, tracked in **purses-4bhh** (note the predicate must align with the guard: a `WHERE status IN ('active','paused')` index without teaching `findActive`/`createSession` about `paused` still collides on "New Session while paused"). **This cluster mitigates exposure** by gating the "New Session" button (§5.4) but does not change the index.

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

- **One disposition per item per curator** (`UNIQUE(item_id, curator_id)`). Set-aside / defer is an upsert. The cross-collection IDOR is closed at the **route** (§6), not by adding `collection_id` to the unique key (which would still allow a foreign item under a different collection path) — `collection_id` is stored (derived server-side) for the read-path index and erasure, not for uniqueness.
- **Upsert semantics — deliberate `ON CONFLICT (item_id, curator_id) DO UPDATE SET disposition = excluded.disposition, updated_at = now()`.** The codebase's only existing upsert precedent uses `onConflictDoNothing`; here `DO UPDATE` is intentional (switching `deferred → set_aside` must take effect). Implementation note: with `postgres-js`, a constraint violation aborts the surrounding transaction — the write path must not wrap the upsert in a transaction that also does conflicting work, and must surface (not swallow) any non-conflict error.
- **Reversal** ("bring back") = `DELETE WHERE item_id = ? AND curator_id = ?`; idempotent (absent row → still 200).
- Domain type: `Disposition = "set_aside" | "deferred"`; `ItemDisposition { id, collectionId, curatorId, itemId, disposition, createdAt, updatedAt }`. The literal union makes an illegal disposition *value* unrepresentable; the illegal item-*state* (disposed + triaged) is prevented at the boundary (§2 invariant), not by the type.

**Why a table, not decision events** (reviewer-confirmed justified): the triage queue reads a materialized map, not replayed events; every reuse alternative breaks an existing invariant (`items.status` is collection-global not curator-scoped; `preferences` is a derived snapshot recomputed from events and exists only post-triage). `// ponytail: the table IS the state; add an event log only if a disposition timeline becomes a product requirement.`

### 4.2 No `session_id` column

A disposition outlives the session that created it. `// ponytail: omit session_id until a feature needs per-session disposition history.`

### 4.3 Migration safety & erasure completeness (postgres-review lens)

- `CREATE TABLE` + indexes on an **empty** table: no lock/rewrite, no `CONCURRENTLY` needed. Down migration `DROP TABLE`. Reversible.
- **Three erasure vectors** (the FK has no `ON DELETE` cascade, matching repo convention — so app code must delete dispositions *before* the parent):
  1. **`deleteByCurator(curatorId)`** → wired into `AccountDeletionService`.
  2. **`deleteByCollection(collectionId)`** → wired into the collection-purge service.
  3. **`deleteByItem(itemId)`** → wired into `ItemPurgeService.purge()` **before** `ItemRepository.hardDelete`, alongside the existing `preferences.deleteByItem` call. Without this, purging an item the curator set aside/deferred raises 23503 and the purge transaction rolls back.
- Each vector gets a DB-integration test asserting dispositions are gone after the delete (mirrors the `preferences` precedent).

## 5. Feature designs

### 5.1 Triage queue eligibility (shared core) + progress cue

Extract a pure function replacing the inline `items.find`:

```ts
// selectTriageItem(items, preferencesByItemId, dispositionByItemId)
//  → { item, showingDeferred, ... }
const untriaged = items.filter(i => !preferencesByItemId.has(i.id));
const candidates = untriaged.filter(i => dispositionByItemId.get(i.id) !== "set_aside");
const active   = candidates.filter(i => dispositionByItemId.get(i.id) !== "deferred");
const deferred = candidates.filter(i => dispositionByItemId.get(i.id) === "deferred");
const item = active[0] ?? deferred[0] ?? null;
const showingDeferred = active.length === 0 && deferred.length > 0;
```

- **set_aside** removed from the queue entirely; **deferred** sorted to the end (resurfaces only when `active` is empty), persisting across sessions (fork 1).
- **Boundary invariant:** the disposition write 409s if a preference exists, and a triage decision deletes any disposition for that item, so `selectTriageItem` never sees a disposed-and-triaged item (§2).
- **Progress cue (count-shaming fix, folded HIGH):** remove the `{triaged} of {totalItems}` numerator/denominator **and** the filling-to-100% bar. Replace with a **ceiling-free, person-side** cue that counts what you *did*, never what's *left* — matching the accepted `CompareChoice` "comparisons made so far" pattern (e.g. a soft "you're moving through these" / items-decided beat with no total). No bar that visibly fills toward a known end. This honors purses-x5u and TONE 4; it is in-scope, not deferred.

`selectTriageItem` is exhaustively unit-tested (set_aside excluded; deferred-to-end; resurfaces when active empty; null when done; `showingDeferred`; mixed sets; regression per fork).

### 5.2 "Not mine — set aside" (purses-1an)

A **quiet secondary action** on the triage screen, in a visually-separated sub-row **below** the four tier buttons (concrete layout contract in §7), ghost-styled. Selecting it does **not** record a triage decision — it upserts `disposition='set_aside'`; the item card crossfades to the next (reduced-motion → instant).

- **Copy:** "Not mine" (sub: "set aside — not mine to decide"). Never "discard / skip / trash". After: a brief inline `role="status"` notice "Set aside · **Bring back**".
- **Excluded from pairing (load-bearing, §3.1):** `compare/page.tsx` filters disposed items out of the candidate list passed to `lib/pairwise-selection.ts` (the draft's "PairingService candidate filter" reference was wrong — `PairingService` is not the live compare path).
- **Durable retrieval (fork 3):** a count-free "Set aside" list reachable by a quiet link (label "Set aside", no number). Each row = item photo + name + "Bring back" (delete disposition → re-enters the queue). Patient holding, not an inbox.

### 5.3 "Not yet — defer" (purses-x5u) + patient-waiting pattern

Second quiet secondary action: "Not yet" (sub: "I'll come back to this") → upsert `disposition='deferred'`; item moves to the end of the pass (§5.1). Idempotent on an already-deferred item.

- **Resurfacing (fork 1):** when `active` is empty and `deferred` remain, the screen wears a calm **patient-waiting** skin — gentle headline ("Ready when you are"), unhurried framing; **never** "X left", an inbox bottom, or the word "resting place" (funereal; per the x5u refinement).
- **Visual tokens (folded AA fix):** the patient-waiting chip uses a **cool-blue benign-state fill with full `ink` text** (DESIGN.md L91 sanctions cool blues for "Not yet"; `ink`-on-cool-blue passes AA in both themes; `ink-soft`-on-cool-blue **fails** light-theme AA — use `ink-soft` only on surface/ground sub-copy). No new tokens. Colour never the sole signal (label + icon).
- **DESIGN.md:** add a short "Patient waiting (Not yet)" entry via `/sync-docs` documenting token *usage* only (no new token, no new hue — stays within TONE-sanctioned tokens).

### 5.4 "I need a moment" pause (purses-z76)

- **Always-visible quiet control in the top chrome / header region** of the triage and compare screens — explicitly **outside** the decision-button zone (so it never competes for the decision tap, commitment 3), but reachable without hunting (easier than quitting). ≥44px, focus-visible. Tap → `PATCH /api/sessions/[id] {status:"paused"}` → calm pause screen.
- **Calm screen:** gentle, reduced-motion-friendly; "Your sort is safe — come back whenever you're ready." Primary "Resume" + quiet "Back to {collection}". No timer, no count.
- **Landing reflects paused & gates New Session (folded MED):** generalize `activeSession` → `currentSession = sessions.find(s => s.status === 'active' || s.status === 'paused')`; when a current session exists, render "Resume" and **gate/redirect the unconditional "New Session" button** (`sort/page.tsx:38`) to Resume — otherwise pausing routinely detonates purses-4bhh. Resume → `PATCH {status:"active"}` → into the sort (event-sourced ⟹ lands on the next undecided item).

### 5.5 Undo after setting a SESSION aside (purses-2f3f)

Restructure `AbandonSessionButton` into a client island that survives `router.refresh()`:

- **State machine:** `idle (current-session card)` → `confirming` → `setAside (notice: "Set aside — you can bring it back · Bring back")`. On success the island stays mounted at a stable tree position and shows the undo notice; `router.refresh()` updates the rest of the page. **No auto-dismiss timer** (a countdown reads as a deadline — TONE 4); the notice persists until Bring back or navigation.
- **Undo → restore:** new `POST /api/sessions/[id]/restore` using a new repo `findByIdIncludingDeleted` + `restore` (clear `deletedAt`). **Authorize first** — collection access + `curatorId === userId` on the include-deleted row — and only then call `restore`; `update()` is never reached by an unauthorized caller.
- Durable session retrieval beyond the on-page undo is out of scope (the bead asks only for confirmation + undo).

## 6. API surface

| Method | Route | Body / params | Auth | Notes |
|---|---|---|---|---|
| POST | `/api/collections/[id]/dispositions` | `{itemId, disposition}` | item-capability guard + curator==user | **Resolve `itemId → item.collectionId` via the existing item-capability guard (`requireApiItemCapability`/equiv) AND assert `item.collectionId === params.id` → 404 on mismatch** (closes cross-collection IDOR). `curatorId`/`collectionId` server-derived. Zod enum. **409** if a preference row exists for (item, curator) — enforces `disposed ⟺ untriaged`. Upsert. |
| GET | `/api/collections/[id]/dispositions?disposition=set_aside` | — | collection access + curator==user | Scope by `curatorId` **server-side**; the client filter is a hint, never the security boundary. Powers the "Set aside" list. |
| DELETE | `/api/collections/[id]/dispositions/[itemId]` | — | item-capability guard + curator==user | Bring back. **Idempotent → 200** whether or not a row existed. 404 (not 403) when the item isn't in this collection, to avoid a cross-collection existence oracle. |
| PATCH | `/api/sessions/[id]` | `{status:"paused"\|"active"}` | existing `authorizeSession` | **Existing route** — pause/resume. No change. |
| POST | `/api/sessions/[id]/restore` | — | include-deleted lookup → collection access + curator==user, **then** restore | **New.** Undo session set-aside. Authorize before `update()`. |

All disposition writes derive `curatorId` from the authenticated session — never the body. The item-capability guard is the established item-scoped pattern (`api-route-authz-pattern` memory); the draft's collection-only guard was the weaker of the two existing patterns.

## 7. Visual / tone treatment

- **Layout contract (folded MED):** triage primary row = the four tier buttons (Love/Like/Maybe/Onward). The two escape actions ("Not yet", "Not mine") form a **single visually-separated ghost sub-row below** the tier block (a divider or a clear spacing token) so the screen reads as two distinct tiers, not a 6-up grid (commitment 3 / Hick's Law). The pause control lives in the **top chrome**, not the decision area. Acceptance: a tablet-portrait screenshot shows the separation.
- **Existing machine-side copy fixed in the same PR (folded MED):** the triage `H1 "Triage"` and subhead "Assign the current item to a preference bucket" are machine-side (TONE 2's "reducing an object to its attributes" frame). Replace the subhead with a person-side prompt (e.g. "How do you feel about this one?"); reconsider the H1. Person-side new copy under a machine-side heading would be jarring.
- **Tokens (no new tokens):** quiet actions = ghost/secondary (transparent, `ink`/`ink-soft` on surface). Patient-waiting chip = cool-blue fill + **`ink`** text (§5.3). **No** semantic/safety hue (set-aside/defer are not errors — DESIGN.md "Brand never speaks Danger"). ≥44px. Colour never the sole signal (label + icon).
- **Motion:** crossfade via `--ease-gentle`/`--duration-reveal`; global `prefers-reduced-motion` collapses to instant.
- **Copy register (person's side):** "Not mine" / "I'll come back to this" / "Ready when you are" / "Take a break" / "Your sort is safe" / "Bring it back". Forbidden: discard, trash, skip, abandon, "X remaining", streak/deadline.
- **A11y (WCAG 2.1 AA):** AA both themes (the shipped chip + ghost-on-surface pairings **added to `contrast.test.ts`**); focus-visible rings; `role="status"` live regions on the undo/notice; confirm dialogs move focus to the safe default.

## 8. Testing strategy

YAGNI does not apply to tests (global override). Every branch/path gets a real test; the important seams cross real layers un-mocked, gated in CI (`db-tests` job runs `src/lib/db`; selective e2e fires on `src/app/**` + `e2e/**`).

- **Unit (vitest/jsdom):** `selectTriageItem` (exhaustive, §5.1). Component tests: triage two quiet actions; "Set aside" list + bring-back; `SetAsideWithUndo` state machine; pause control + calm screen; patient-waiting skin; the progress cue is ceiling-free.
- **DB integration (`src/lib/db/*.integration.test.ts`, un-mocked route→repo→pg):**
  - Disposition upsert/switch/delete + `UNIQUE`. **Idempotency no-ops (named, would-fail):** DELETE-absent → **200**; a second `defer` upsert leaves exactly one row, `disposition='deferred'`, unchanged `created_at`; back-to-back `set_aside` upserts succeed with one final row.
  - **`disposed ⟺ untriaged` enforcement:** POST disposition on an item with a preference → **409**, no row; a triage decision on a deferred item **clears** its disposition.
  - **Negative assertions (not just presence):** a `set_aside`/`deferred` item is **absent** from `selectNextPair`'s candidates (compare path) and from results; a `deferred` item is **absent** from the queue while `active` items remain, then **present** once they're exhausted.
  - **Erasure:** dispositions gone after account-deletion, collection-purge, **and item-purge** (§4.3).
  - **IDOR — the distinctive co-member case (folded HIGH):** curator **B who is a member of A's shared collection** gets **403** on `DELETE /dispositions/[A's itemId]` and `POST /sessions/[A's id]/restore` (the membership-passing path the stranger backstop misses); cross-collection itemId → **404**, no row. **Register the three disposition routes + `/restore` into `route-authz-enumeration.integration.test.ts`** so its stranger-403/404 floor provably covers them (case-count floor moves).
- **e2e (Playwright, `e2e/**`, tablet+phone+desktop via fixtures):** Not-mine set aside → gone from triage AND never in compare → undo brings back; Not-yet defer → end-of-pass → resurfaces with the calm skin; pause → calm screen → resume; **session set-aside → after `router.refresh()` settles, the undo control is still visible AND clickable** → undo restores. Light+dark screenshots per PR.

## 9. Decomposition & PR sequencing

Each PR is one logical change with full gates (build / test:ci / lint / auth:verify / `RUN_DB_TESTS=1` test:db) + selective e2e + light/dark screenshots; whole-branch adversarial review weighted to the lenses touched; merge when green (rebase if behind).

| PR | Branch | Scope | Primary review lenses |
|----|--------|-------|----------------------|
| **PR1** | `epicC-dispositions-not-yet` | `item_dispositions` table + migration + repo (curator/collection/**item** erasure) + dispositions API (with §6 IDOR + 409 invariant) + `selectTriageItem` + **compare pairing-exclusion** + **"Not yet"** affordance + resurfacing + patient-waiting skin + contrast-gate entry + DESIGN.md pattern + the triage progress-cue + copy fixes. | postgres-review, security (IDOR), system-design, UX, a11y, QA |
| **PR2** | `epicC-not-mine` | **"Not mine"** set-aside affordance + inline undo + durable "Set aside" list + bring-back. Builds on PR1. | security (IDOR), UX, a11y, craftsman, QA |
| **PR3** | `epicC-pause` | "Take a break" (top chrome, triage+compare) + calm screen + pause/resume + landing `currentSession` + **New-Session gating** (4bhh mitigation). | UX, a11y, system-design, craftsman |
| **PR4** | `epicC-session-undo` | Session set-aside confirmation + undo + `POST /restore` + `findByIdIncludingDeleted`/`restore` + `SetAsideWithUndo` island. | security (IDOR), system-design, UX, QA |

Order: PR1 → PR2 (depends on PR1). PR3, PR4 independent. **On the Craftsman "PR1 bundles two changes" concern:** PR1 ships the infrastructure *with its first consumer* (Not Yet) — standard practice; a table with zero consumers is the YAGNI smell the same persona flags elsewhere. The infra (table/repo/API/eligibility/pairing-exclusion) is independently unit- and DB-tested, so the bundling doesn't hide coverage. PR3+PR4 may merge if both prove small.

## 10. Out of scope / follow-ups

- **purses-4bhh** — `sessions_active_unique` over-enforcement (§3.3). Fix is a partial-index + aligned-guard redesign; this cluster only mitigates exposure (§5.4) and records the predicate↔guard hole in the bead.
- **Durable session retrieval** beyond on-page undo (§5.5).
- **"Not mine" / "Not yet" in compare** — deferred by fork 2 (triage only).

## 11. Risks & residual

- **Pairing exclusion is load-bearing** (not belt-and-suspenders): without the explicit compare filter, disposed items reappear in "Which do you love more?" (TONE 4 violation). Covered by a negative DB-integration test (§8).
- **Concurrency (accepted low-risk):** a triage-decision write (event + recalc) and a set-aside upsert are two endpoints with no shared transaction; a same-item race across two tabs could momentarily produce both a preference and a disposition. Bounded by the §2 invariant (write 409s on existing preference; triage clears disposition) and self-heals on next read; full transactional sequencing is unjustified for a single-user tablet flow. Noted, not fixed.
- **Undo island survival:** verified by an e2e assertion that the undo control is still clickable *after* `router.refresh()` settles (§8) — a jsdom component test cannot reproduce a real App Router refresh and does not count as coverage for this.
- **Idempotency:** defer-on-deferred, bring-back-on-absent (→200), and double-tap set-aside are all named no-op tests (§8), plus the `AbandonSessionButton` in-flight-guard precedent for the UI double-tap.
