# Session Uniqueness Redesign + Paused-on-Collection-Page — Design Spec

**Date:** 2026-06-24
**Status:** Draft — pending adversarial spec review (hard gate: postgres-review + system-design)
**Author:** autonomous follow-up session (ultracode)
**Beads:** purses-4bhh (root `sessions_active_unique` over-enforcement), purses-ydeu (collection page surfaces active-only).
**Governing authorities:** TONE.md (first-order) → PRODUCT.md → DESIGN.md.

## 1. Purpose

Two related session-lifecycle fixes, shipped as one branch:

- **purses-4bhh (the root fix):** `sessions_active_unique` is `UNIQUE(collection_id, curator_id)` with **no predicate**, so a (collection, curator) pair can hold **at most one session row EVER** — including soft-deleted (set-aside), completed, and abandoned rows. A curator who finishes or sets aside a sort then **cannot start a new one**: the insert collides on the unconditional index. Epic C PR1–PR3 only *mitigated* the symptom (UI-gate "New Session" for active|paused; a 409 net so it's never a 500). This makes the index a **partial** unique index that enforces only one *in-progress* (active|paused) session, so terminal/soft-deleted sessions free the slot and a new sort can begin. The interim 409 net stays as defense-in-depth.
- **purses-ydeu:** the collection landing page (`/collections/[id]`) computes `activeSession = status === "active"` only, so a **paused** session shows no "your sort" card there — inconsistent with the sort landing (which surfaces active|paused). Mirror that here.

## 2. Settled invariant change

**Before:** one session row per (collection, curator) **ever** (unconditional unique).
**After:** one **in-progress** session per (collection, curator) — `WHERE deleted_at IS NULL AND status IN ('active','paused')`. Multiple **historical** rows (completed / abandoned / soft-deleted) are allowed and freely coexist; they no longer occupy the slot.

This is exactly the schema's latent intent: the `number` column + `MAX+1` allocation + `sessions_collection_number_unique` were always designed for *multiple sessions over time per collection*, which the unconditional `sessions_active_unique` contradicted. This redesign resolves that contradiction.

**The predicate↔guard alignment trap (§3.3 of the gentle-affordances spec):** a partial index whose predicate the app guard doesn't match still 500s. So the index predicate (`active|paused`, not-deleted) and the `createSession` guard (block when an in-progress active|paused session exists) must move **together**.

## 3. Architecture facts (proven from source)

- **Migrator is transactional.** `scripts/migrate.ts` uses drizzle-orm/postgres-js `migrate()`, which executes each migration's statements inside a transaction. `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY` **cannot run inside a transaction** → the rebuild must be **non-concurrent**. Justified: (a) the migrator precludes CONCURRENTLY; (b) the `sessions` table is tiny and single-writer-per-curator (a personal app on Neon) so the brief `SHARE`/`ACCESS EXCLUSIVE` lock during a drop+rebuild is negligible.
- **Data safety:** the *current* unconditional index guarantees **≤ 1 row per (collection, curator)** in prod today. The new partial index is a strict subset of those rows, so `CREATE UNIQUE INDEX` **cannot** find a duplicate — the migration cannot fail on existing data.
- **Index name stays `sessions_active_unique`.** `SessionRepository.isCurrentSessionConflict` (`SessionRepository.ts:211`) matches on the message substring `sessions_active_unique`, and the route's 409 net depends on it. Renaming would silently break the 409 net. Keep the name.
- **Live create path:** `POST /api/sessions` → `SessionController.createSession` → `sessionRepo.create` (no pre-check) → the repo's `try/catch` 409 net. `SessionService.createSession` is a *separate* path with a `findActive` (active-only) pre-check; both surface `CurrentSessionExistsError` (→ 409 via `errorResponse`).
- **Post-migration the 409 net already covers two-in-progress** for BOTH active+active and active+paused: a new `active` insert against an existing active **or** paused (both in the partial predicate, both `deleted_at IS NULL`) collides → 23505 → `CurrentSessionExistsError` → 409. So correctness for "two in progress" needs no guard change; the guard change is the §3.3 *alignment* (a friendly early 409 that matches the predicate, instead of the catch).
- **Collection page (`collections/[id]/page.tsx:33,106-113`):** `activeSession = sessions.find(s => s.status === "active")`; passes `{id, number, goal}` to `<ActiveSessionPanel>` (mounted unconditionally) with `resumeHref` from `activeSession?.number`. `ActiveSessionPanel` hardcodes the heading "Active Sorting Session" + `<Badge variant="active">`.

## 4. The fix

### 4.1 Migration `0009` — partial unique index (purses-4bhh)

Schema change in `src/lib/db/schema.ts` (`sessionsTable`):

```ts
activeIdx: uniqueIndex("sessions_active_unique")
  .on(table.collectionId, table.curatorId)
  .where(sql`${table.deletedAt} is null and ${table.status} in ('active','paused')`),
```

(import `sql` from `drizzle-orm`.) Run `npm run db:generate`; **hand-verify** the generated `drizzle/0009_*.sql` emits exactly:

```sql
DROP INDEX IF EXISTS "sessions_active_unique";
CREATE UNIQUE INDEX "sessions_active_unique" ON "sessions" ("collection_id","curator_id")
  WHERE "sessions"."deleted_at" is null and "sessions"."status" in ('active','paused');
```

If drizzle-kit's diff is incomplete (it sometimes mishandles partial-index predicates), **hand-write** the migration SQL to the above (same name, partial predicate). Both statements run non-concurrently inside the migrator's transaction — acceptable per §3 (tiny table; can't fail on existing data).

- **Reversibility (documented, no auto-down in this repo):** the inverse is `DROP INDEX "sessions_active_unique"; CREATE UNIQUE INDEX "sessions_active_unique" ON "sessions" ("collection_id","curator_id");` — record it in a comment in the migration file.
- **Journal + snapshot:** `_journal.json` gains idx 9; `0009_snapshot.json` reflects the partial index. Verify they're coherent.

### 4.2 `findInProgress` + guard alignment (purses-4bhh §3.3)

- Add `findInProgress(collectionId, curatorId): Promise<Session | null>` to `ISessionRepository` + impl — identical to `findActive` but `status IN ('active','paused')` (still `isNull(deletedAt)`).
- `SessionService.createSession` pre-check: replace `findActive` with `findInProgress`, so the friendly early `CurrentSessionExistsError` matches the new index predicate (catches a *paused* in-progress session, not just active). `findActive` stays for `getActiveSession`.
- The repo `create` 409 net is unchanged (it remains the real safety net for any path, including the Controller path the live route uses).

### 4.3 Paused on the collection page (purses-ydeu)

- `collections/[id]/page.tsx`: `const currentSession = sessions.find(s => s.status === "active" || s.status === "paused")`. Pass `{id, number, goal, status}` to `<ActiveSessionPanel>`; `resumeHref` from `currentSession?.number`.
- `ActiveSessionPanel`: extend `SessionSummary` with `status: "active" | "paused"`. The card heading reflects status ("Active Sorting Session" / "Paused Sorting Session") and the `<Badge variant={status}>` shows the matching calm badge (the `paused` badge is already the cool-blue benign token from PR3 — DESIGN.md "Brand never speaks Danger"). Resume + Set aside behave identically for both. The undo path is unchanged.

## 5. Testing strategy

YAGNI does not apply to tests. The migration is behaviour-tested through the real DB harness (which applies migrations).

- **DB integration (`src/lib/db/*.integration.test.ts`, un-mocked, `RUN_DB_TESTS`):**
  - **The root-fix proof:** a curator with a **soft-deleted** session can `createSession` a new one (was the bug — collided → blocked; now succeeds, a fresh row). Same for a **completed** and an **abandoned** session.
  - **Two-in-progress still rejected:** with an **active** session, a second create → `CurrentSessionExistsError`/409. With a **paused** session, a create → `CurrentSessionExistsError`/409 (proves the predicate↔guard alignment AND the partial index both catch paused).
  - **Negative-space:** the partial index is `sessions_active_unique` and the 409 net's message match still fires (a create-while-active still yields the 409, not a 500) — guards against an accidental index rename.
  - `findInProgress` returns a paused session (not just active) and null when only terminal/deleted rows exist.
- **Component (jsdom):** `ActiveSessionPanel` renders "Paused Sorting Session" + the paused badge for a paused session, and "Active Sorting Session" + active badge for active; Resume/Set aside/undo unchanged. Collection page test (if present) surfaces the panel for a paused session.
- **e2e (`e2e/**`, 3 viewports):** **create-after-set-aside** — set a session aside, then start a new sort, and assert it SUCCEEDS (lands on triage), not a 409/500 dead end. Plus a quick check the collection page shows the paused card.
- **CI placement:** new DB tests under `src/lib/db/`; e2e under `e2e/**`.

## 6. Decomposition (one PR, 3 tasks)

| Task | Scope | Review lenses |
|---|---|---|
| **1** | schema partial index + migration `0009` + `findInProgress` + `SessionService` guard alignment + DB-integration behavior tests (create-after-terminal works; two-in-progress→409; paused→409). | postgres-review, system-design, security, QA |
| **2** | purses-ydeu — collection page `currentSession` (active\|paused) + `ActiveSessionPanel` status-aware heading/badge + component test. | UX/TONE, a11y, craftsman |
| **3** | e2e (create-after-set-aside succeeds; collection paused card) + a "collection-paused" screenshot surface. | QA |

The migration (predicate) and the guard (`findInProgress`) are in the **same task** deliberately — §3.3's trap is that they must move together; reviewing them apart is how the alignment bug ships.

## 7. Risks & out of scope

- **Migration on prod:** non-concurrent rebuild of a tiny index; cannot fail on existing data (§3). The deploy applies it via `npm run db:migrate`. No data backfill needed.
- **The 409 net is retained** (not removed) — it remains the safety net for any path and any unforeseen terminal-state combination. Belt and suspenders.
- **No new follow-ups** will be filed from this work (per the owner's instruction); any residual nit is folded inline or noted in the PR body.
- Out of scope: changing the `number` allocation (`getNextSessionNumber` still MAX-over-all, correct — soft-deleted rows keep their number); the `deleted` status enum member (unused legacy; untouched).
