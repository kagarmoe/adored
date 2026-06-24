# Session Uniqueness Redesign + Paused-on-Collection-Page — Design Spec

**Date:** 2026-06-24
**Status:** Reviewed (4-persona adversarial review folded; BLOCK resolved) — ready for planning
**Author:** autonomous follow-up session (ultracode)
**Beads:** purses-4bhh (root `sessions_active_unique` over-enforcement), purses-ydeu (collection page surfaces active-only).
**Governing authorities:** TONE.md (first-order) → PRODUCT.md → DESIGN.md.

## 0. Review folds (changelog)

A 4-persona adversarial spec review (postgres, system-design, security+QA, UX+craftsman) returned **BLOCK**. All findings verified against source and folded:

- **[CRITICAL → fixed] restore-collision.** The partial index *introduces* a new 500. Set aside A (slot frees) → start B (occupies slot) → Undo A → `restore` sets A `active`+`deletedAt=null` → A and B both satisfy the partial predicate → 23505 on `sessions_active_unique` → **`restore/route.ts` has no try/catch → raw 500.** The 409 net the design leaned on lives only in `create()`. **Fix (§4.4):** make restore slot-aware — `restore()` catches the conflict → `CurrentSessionExistsError` (mirroring `create`), the restore route wraps in `errorResponse` (→ 409), and the undo UI shows a gentle, *accurate* message (not "try again"). Regression test added.
- **[HIGH → fixed] `findInProgress` belongs on the restore path, not `SessionService`.** `SessionService.createSession` is **dead code** (grep: instantiated only by its own test; the live `POST /api/sessions` goes `SessionController → repo.create`). So the §4.2 draft edited a path no route uses. Redirected: `findInProgress` is the friendly pre-check on the **restore** path (§4.4). `SessionService` is left untouched (noted as dead code) — the real create-side alignment is the existing `create()` 23505 net, which already covers active+active AND active+paused post-index.
- **[HIGH → fixed] existing conflict test inverts.** `src/lib/db/session-create-conflict.integration.test.ts` currently asserts *soft-deleted slot → 409*. After 0009 that case returns **201** (the root-fix proof). The test must be **rewritten** (soft-deleted/completed/abandoned → 201 + fresh row; the *active* and *paused* in-progress cases stay 409), not merely supplemented (§5).
- **[HIGH → fixed] drizzle-kit 0.20.17 cannot serialize a partial-index predicate.** Snapshot schema v5 stores only name/columns/isUnique — no predicate. So `db:generate` will emit an **empty** migration; "generate then hand-verify" is backwards. **Fix (§4.1):** hand-author `0009` (SQL + journal + snapshot copy), and add a **drift-guard** assertion that `db:generate` produces no pending migration afterward.
- **[HIGH → fixed] paused "Resume" must un-pause.** `ActiveSessionPanel`'s Resume is a plain `<Link>`; for a *paused* session that lands the user mid-sort while the row stays `status='paused'` — desyncing the in-progress predicate. The sort landing already uses `ResumeControl` (PATCH `status:active` then navigate) for paused. **Fix (§4.3):** the paused branch uses `ResumeControl`; active keeps the `<Link>`. "behave identically" struck.
- **[MEDIUM → fixed] copy register.** Paused copy aligns with the already-shipped sort-landing voice ("Your sort is paused" / "Your sort is safe — pick up where you left off"), not a machine-register "Paused Sorting Session" (§4.3).
- **[LOW → folded] doc clarity.** §3 names the lock classes + the data-safety proof; §7 states reversibility honestly (forward-only) and acknowledges the cap-1 → unbounded-historical-rows change (auth-gated, owner-only — no cross-tenant DoS).
- **Confirmed clean (reviewer-verified):** no IDOR from loosening uniqueness; no injection in the static predicate; the db-tests harness *does* apply migration 0009 (`test-db.sh` runs `npm run db:migrate`); index name `sessions_active_unique` is preserved so the 409 net's substring match survives.

## 1. Purpose

Two related session-lifecycle fixes, one branch:

- **purses-4bhh (root fix):** `sessions_active_unique` is `UNIQUE(collection_id, curator_id)` with **no predicate** → one session row per (collection, curator) **ever** (incl. soft-deleted/completed/abandoned). A curator who finishes or sets aside a sort **cannot start a new one**. Make it a **partial** unique index enforcing only one *in-progress* (active|paused, not-deleted) session, so terminal/soft-deleted sessions free the slot. The PR3 409 net is retained as defense-in-depth.
- **purses-ydeu:** the collection landing page surfaces only `status==='active'`; a **paused** session shows no "your sort" card there. Mirror the sort landing (active|paused), with the correct un-pause behaviour and voice.

## 2. Settled invariant change

**Before:** one session row per (collection, curator) **ever**. **After:** one **in-progress** session — `WHERE deleted_at IS NULL AND status IN ('active','paused')`. Historical rows (completed / abandoned / soft-deleted) coexist freely; they no longer hold the slot.

This realizes the schema's latent intent (`number` + `MAX+1` + `sessions_collection_number_unique` were designed for many sessions over time). **Predicate↔guard alignment trap:** every WRITER that puts a row into the in-progress predicate — `create` **and** `restore` — must respect the slot. The original spec missed `restore`; that's the critical fold.

## 3. Architecture facts (proven from source)

- **Migrator is transactional.** `scripts/migrate.ts` → drizzle-orm/postgres-js `migrate()` runs each migration in a transaction → `CREATE INDEX CONCURRENTLY` impossible. Non-concurrent it is.
- **Lock + data-safety (postgres-review):** the rebuild is `DROP INDEX` (`ACCESS EXCLUSIVE`) + `CREATE UNIQUE INDEX` (`SHARE` + brief `ACCESS EXCLUSIVE`), both in the migrator's **single transaction**, so uniqueness is never unenforced from a committed-write standpoint (concurrent writers block, they don't slip through). `CREATE UNIQUE INDEX` **cannot fail**: the current unconditional index (shipped in `0000`, always present) guarantees ≤1 row per slot today, and the partial set is a strict subset. Acceptable because `sessions` is tiny and single-writer-per-curator (personal app on Neon); the lock is held milliseconds.
- **drizzle-kit 0.20.17 / snapshot v5** does not serialize partial-index predicates (the `0008` snapshot's `sessions_active_unique` entry has only name/columns/isUnique). `db:generate` is blind to a predicate-only change → emits nothing. Hand-author 0009 (§4.1).
- **Index name stays `sessions_active_unique`** — `isCurrentSessionConflict` (`SessionRepository.ts:211`) matches that substring; the 409 net depends on it.
- **Live create path:** `POST /api/sessions` → `SessionController.createSession` → `sessionRepo.create` (the 23505 net). `SessionService.createSession` is **dead** (no route wires it).
- **restore path:** `POST /api/sessions/[id]/restore` → `SessionController.restoreSession` → `sessionRepo.restore` (bare `UPDATE deletedAt=null, status='active'`, **no try/catch in the route**).
- **softDelete** sets only `deletedAt` (status stays e.g. `active`), so the partial predicate's `deleted_at IS NULL` is what excludes a set-aside row — correct.
- **Collection page (`collections/[id]/page.tsx:33,106-113`):** `activeSession = status==='active'`; passes `{id, number, goal}` (no status) to `<ActiveSessionPanel>` (mounted unconditionally); the panel hardcodes "Active Sorting Session" + `<Badge variant="active">`. `ResumeControl` (PATCH `status:active` then navigate) is the established paused-resume control (`sort/page.tsx`).

## 4. The fix

### 4.1 Migration `0009` — partial unique index (purses-4bhh)

**Schema** (`src/lib/db/schema.ts`, `sessionsTable`) — add `.where()` for intent (drizzle-kit 0.20.17 ignores it, harmless; documents the DB truth and future-proofs):

```ts
activeIdx: uniqueIndex("sessions_active_unique")
  .on(table.collectionId, table.curatorId)
  .where(sql`${table.deletedAt} is null and ${table.status} in ('active','paused')`),
```

(import `sql` from `drizzle-orm`.)

**Migration — HAND-AUTHORED** (because `db:generate` emits nothing for a predicate-only change):

1. Run `npm run db:generate` once. **Expected: an empty/near-empty migration or none.** If it scaffolds a `0009_*.sql` + journal entry + snapshot, reuse that scaffolding; otherwise create them by copying the structure of an existing migration (`.sql` + a `_journal.json` idx-9 entry + `0009_snapshot.json` copied from `0008`'s — the v5 snapshot can't encode the predicate, so it stays shape-identical).
2. Write the `0009_<tag>.sql` body exactly:

```sql
DROP INDEX IF EXISTS "sessions_active_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_active_unique" ON "sessions" ("collection_id","curator_id")
  WHERE "sessions"."deleted_at" is null and "sessions"."status" in ('active','paused');
-- Reversal is NOT a clean automatic down: once a curator has create-after-terminal
-- (multiple rows per slot), recreating the UNCONDITIONAL index 23505s on that data.
-- To roll back, revert the application behaviour, or resolve duplicates first.
```

3. **Drift guard:** after committing, run `npm run db:generate` again and confirm it produces **no new pending migration** (schema matches migrations). Document the observed behaviour in the task report — if drizzle wants to re-drop/recreate `sessions_active_unique`, the snapshot is incoherent and must be reconciled before merge.
4. The db-tests harness applies migrations (`test-db.sh` → `npm run db:migrate`), so the integration tests exercise the **new** index.

### 4.2 (removed) — `SessionService` guard

The draft's `SessionService.createSession` `findActive→findInProgress` swap is **dropped**: `SessionService` is dead code. The live create-side alignment is already correct — `create()`'s 23505 net catches active+active and active+paused (both satisfy the partial predicate). `findInProgress` is added (§4.4) for the restore path where it's actually needed.

### 4.3 Paused on the collection page (purses-ydeu)

- `collections/[id]/page.tsx`: `const currentSession = sessions.find(s => s.status === "active" || s.status === "paused")`. Pass `{id, number, goal, status}` to `<ActiveSessionPanel>`; `resumeHref` from `currentSession?.number`.
- `ActiveSessionPanel`: extend `SessionSummary` with `status: "active" | "paused"`.
  - **Resume (corrected):** active → keep the plain `<Link href={resumeHref}>`; **paused → `<ResumeControl sessionId resumeHref>`** (PATCH `status:active` then navigate) so the row is un-paused, not left desynced. (Resume is rendered in the non-confirming branch; swap the Link for ResumeControl when `status==='paused'`.)
  - **Copy (person-side, matches the sort landing):** for paused, heading "Your sort is paused" + a reassuring line "Your sort is safe — pick up where you left off." (mirror `sort/page.tsx`); for active, keep the existing "Active Sorting Session" card. `<Badge variant={status}>` shows the matching calm chip — the `paused` badge is already the cool-blue benign token (PR3); active stays the active badge. Set aside / undo behave identically for both (soft-delete is reversible regardless of status).

### 4.4 restore is slot-aware (purses-4bhh, the critical fold)

- Add `findInProgress(collectionId, curatorId): Promise<Session | null>` to `ISessionRepository` + impl — `status IN ('active','paused')` AND `isNull(deletedAt)`.
- `SessionRepository.restore(id)` — wrap the UPDATE in the same try/catch as `create`: on a `sessions_active_unique` 23505, throw `CurrentSessionExistsError` (the slot is held by a newer in-progress session). This is the DB-enforced, race-free net.
- `SessionController.restoreSession` — friendly pre-check: if `findInProgress(collectionId, curatorId)` returns a session (other than this one), throw `CurrentSessionExistsError` before the UPDATE (clean early 409; the `restore()` catch remains the backstop for the TOCTOU race).
- `src/app/api/sessions/[id]/restore/route.ts` — wrap the `restoreSession` call in `try/catch → errorResponse(error)` (mirrors `POST /api/sessions`), so `CurrentSessionExistsError` surfaces as **409**, never a 500.
- **Undo UI (`ActiveSessionPanel.bringBack`)** — on a **409** specifically, show a gentle, accurate message ("You've started a new sort since — this one stays set aside.") rather than the generic "give it another try" (which is wrong: retrying won't help). Other failures keep the retry copy. Read `res.status === 409` to branch.

## 5. Testing strategy

YAGNI does not apply to tests. The migration is behaviour-tested through the real DB harness (which applies 0009).

- **Rewrite `src/lib/db/session-create-conflict.integration.test.ts`** (folded HIGH):
  - **Root-fix proofs (now 201 + a fresh second row):** create-after-**soft-deleted**, create-after-**completed**, create-after-**abandoned**. (The soft-deleted case is the one that currently asserts 409 — invert it.)
  - **Still 409 (in-progress slot held):** with an **active** session, a second create → 409; with a **paused** session, a create → 409 (proves the partial index catches paused).
- **New `src/lib/db/session-restore-conflict.integration.test.ts`** (folded CRITICAL): set aside A (soft-delete), create B (now active), `POST /api/sessions/{A}/restore` → **409** (not 500), A stays soft-deleted, B unaffected. Plus: restore of A when the slot is free → 200 (the happy path still works). `findInProgress` returns a paused session and null when only terminal/deleted rows remain.
- **Component (jsdom):** `ActiveSessionPanel` — renders the person-side paused copy + the paused badge for a paused session; the paused Resume issues a **PATCH** (ResumeControl), not a bare navigation; the active card unchanged; `bringBack` on a 409 shows the "started a new sort" message, on other errors the retry message.
- **e2e (`e2e/**`, 3 viewports):** **create-after-set-aside succeeds** — set a session aside, start a new sort, assert it lands on triage (not a 409/500 dead end). Collection page shows the paused card with a working Resume.
- **CI placement:** new DB tests under `src/lib/db/`; e2e under `e2e/**`. The harness applies 0009.

## 6. Decomposition (one PR, 4 tasks)

| Task | Scope | Review lenses |
|---|---|---|
| **1** | schema `.where()` + **hand-authored** migration `0009` (+ snapshot/journal + drift-guard check). | postgres-review, data |
| **2** | `findInProgress` + **slot-aware restore** (`restore()` catch + controller pre-check + route `errorResponse` + undo-UI 409 message) + rewrite `session-create-conflict` test + new `session-restore-conflict` test. | system-design, security, QA |
| **3** | purses-ydeu — collection page `currentSession` + `ActiveSessionPanel` status-aware (ResumeControl for paused, person-side copy, status badge) + component tests. | UX/TONE, a11y, craftsman |
| **4** | e2e (create-after-set-aside succeeds; collection paused card + Resume) + a "collection-paused" screenshot surface. | QA |

Migration (Task 1) and the restore/create guards (Task 2) are adjacent but separable: Task 1 makes the index partial (and *introduces* the restore-collision); Task 2 closes it. **Both must merge together** — Task 1 alone ships the critical 500.

## 7. Risks & out of scope

- **Migration on prod:** non-concurrent rebuild of a tiny index in one transaction; `ACCESS EXCLUSIVE`/`SHARE` held milliseconds; cannot fail on existing data (§3). Applied via `npm run db:migrate` on deploy. No backfill.
- **Reversibility is forward-only.** There is no safe automatic down once create-after-terminal has produced multiple rows per slot (recreating the unconditional index would 23505). Roll back by reverting application behaviour, or resolve duplicates first. Stated honestly in the migration comment.
- **Cap-1 → unbounded historical rows.** The old index capped a slot at one row ever; the new one allows unbounded completed/abandoned/soft-deleted rows per (collection, curator). Self-inflicted, auth-gated, owner-only — not a cross-tenant DoS; acceptable for this app's threat model (a future per-curator cap is possible if ever needed).
- **The 409 net is retained** (create) and **extended** (restore) — belt and suspenders against any terminal-state combination.
- **No new follow-ups** filed (owner instruction); residual nits fold inline or note in the PR body.
- Out of scope: `getNextSessionNumber` (MAX-over-all stays correct — soft-deleted rows keep their number); the unused `deleted` status enum member.
