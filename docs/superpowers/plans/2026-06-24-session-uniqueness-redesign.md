# Session Uniqueness Redesign + Paused-on-Collection-Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make `sessions_active_unique` a **partial** unique index (one in-progress session per collection+curator; terminal/soft-deleted sessions free the slot), make the **restore (undo set-aside)** path slot-aware so it can't 500, and surface **paused** sessions on the collection page with a correct un-pause.

**Architecture:** Migration `0009` rebuilds the index as partial. The index *introduces* a restore-collision (undo a set-aside after starting a new sort → two in-progress rows), closed by making `restore()` catch the conflict → 409 (mirroring `create`). The PR3 409 net is retained. `findInProgress` is the friendly pre-check on the restore path. The collection page mirrors the sort landing's paused handling (`ResumeControl`, person-side copy).

**Tech Stack:** Drizzle ORM + Neon Postgres (drizzle-kit 0.20.17, snapshot v5), Next.js App Router, Vitest (`RUN_DB_TESTS` node integration), Playwright.

**Spec:** `docs/superpowers/specs/2026-06-24-session-uniqueness-redesign.md`.

## Global Constraints

- **Index name stays `sessions_active_unique`** — `SessionRepository.isCurrentSessionConflict` matches that substring; renaming silently breaks the 409 net.
- **`errorResponse` already maps `CurrentSessionExistsError → 409`** (`src/server/api/http-errors.ts:44`). Reuse it; do not invent a new error type.
- **Migrator is transactional** (`scripts/migrate.ts` → drizzle `migrate()`) → **no `CONCURRENTLY`**. Non-concurrent DROP+CREATE in one txn; cannot fail on existing data (old unconditional index guarantees ≤1 row/slot).
- **drizzle-kit 0.20.17 (snapshot v5) cannot serialize a partial-index predicate** → the migration is **hand-authored**; finish with a drift-guard (`db:generate` clean afterward).
- Person-side copy (TONE 4); ≥44px, focus-visible, AA both themes, `role=status`. The `paused` Badge is already the calm cool-blue token (PR3).
- Tests run in CI: DB tests under `src/lib/db/` (the `db-tests` job applies migration 0009 via `test-db.sh` → `npm run db:migrate`); e2e under `e2e/**`.
- **Tasks 1 and 2 must merge together** — Task 1 alone ships the critical restore 500.

---

### Task 1: Migration `0009` — partial `sessions_active_unique`

**Files:**
- Modify: `src/lib/db/schema.ts` (add `.where()` to the `sessionsTable` `activeIdx`)
- Create: `drizzle/0009_<tag>.sql` + `drizzle/meta/0009_snapshot.json` + `drizzle/meta/_journal.json` idx-9 entry

**Interfaces:** Produces a partial unique index `sessions_active_unique ON sessions(collection_id,curator_id) WHERE deleted_at IS NULL AND status IN ('active','paused')`. Same name.

- [ ] **Step 1: Edit `src/lib/db/schema.ts`** — add `sql` to the `drizzle-orm` import, and change the `sessionsTable` `activeIdx`:

```ts
activeIdx: uniqueIndex("sessions_active_unique")
  .on(table.collectionId, table.curatorId)
  .where(sql`${table.deletedAt} is null and ${table.status} in ('active','paused')`),
```

(`import { ..., sql } from "drizzle-orm";`)

- [ ] **Step 2: Run `npm run db:generate` and OBSERVE.** drizzle-kit 0.20.17 ignores the predicate (snapshot v5 can't encode it), so expect **no new migration** or an **empty** one. Record exactly what happened in the report.

- [ ] **Step 3: Hand-author the migration.** Create `drizzle/0009_<tag>.sql` (pick any tag, e.g. `0009_partial_active_session`):

```sql
DROP INDEX IF EXISTS "sessions_active_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_active_unique" ON "sessions" ("collection_id","curator_id") WHERE "sessions"."deleted_at" is null and "sessions"."status" in ('active','paused');
```

Then make the meta coherent so `migrate()` applies it and future `db:generate` is clean:
- Append to `drizzle/meta/_journal.json` `entries`: `{ "idx": 9, "version": "5", "when": <epoch_ms>, "tag": "0009_<tag>", "breakpoints": true }`.
- Create `drizzle/meta/0009_snapshot.json` by copying `0008_snapshot.json`, giving it a fresh `id` (any uuid) and setting `prevId` to `0008_snapshot.json`'s `id`. (The `sessions_active_unique` index entry stays shape-identical — v5 has no predicate field, so the snapshot legitimately can't reflect it.)

> If Step 2's `db:generate` already scaffolded a `0009_*.sql` + journal + snapshot, reuse that scaffolding and just set the `.sql` body to the DROP+CREATE above (drop any stray empty statements).

- [ ] **Step 4: Apply + drift-guard.** Run `npm run test:db -- src/lib/db/session-create-conflict.integration.test.ts` once to force the harness to apply migrations (it will likely FAIL on the now-inverted soft-deleted assertion — that's Task 2's reconcile, expected here). Confirm the migration **applies cleanly** (no SQL error). Then run `npm run db:generate` again and confirm it reports **no pending changes** (the drift guard). Record both in the report.

- [ ] **Step 5: Commit** — `feat(db): sessions_active_unique becomes a partial index — one in-progress session per slot (purses-4bhh, migration 0009)`.

---

### Task 2: Slot-aware restore + `findInProgress` + reconcile/extend the conflict tests

**Files:**
- Modify: `src/server/repositories/SessionRepository.ts` (interface — add `findInProgress`)
- Modify: `src/server/repositories/implementations/SessionRepository.ts` (`findInProgress` + wrap `restore` in the 23505 catch)
- Modify: `src/server/api/sessions.ts` (`restoreSession` pre-check)
- Modify: `src/app/api/sessions/[id]/restore/route.ts` (wrap in `try/catch → errorResponse`)
- Modify: `src/features/sessions/ActiveSessionPanel.tsx` (`bringBack` 409 message)
- Rewrite: `src/lib/db/session-create-conflict.integration.test.ts`
- Create: `src/lib/db/session-restore-conflict.integration.test.ts`

**Interfaces:**
- Consumes: `CurrentSessionExistsError` (exists, `SessionRepository.ts:15`), `isCurrentSessionConflict` (exists), `errorResponse`.
- Produces: `findInProgress(collectionId, curatorId): Promise<Session | null>` on `ISessionRepository` + impl.

- [ ] **Step 1: Rewrite the failing conflict test** `src/lib/db/session-create-conflict.integration.test.ts`. Keep the ACTIVE-collision `it` (stays 409). **Invert** the soft-deleted `it` to the root-fix proof, and add completed/abandoned + paused:

```ts
it("201s a new create after the slot's session is SET ASIDE (soft-deleted) — terminal rows free the slot (purses-4bhh)", async () => {
  const { db } = getTestDb();
  const repo = new SessionRepository(db);
  const collectionId = await seedBareCollection(ownerId);
  mockGetSession.mockResolvedValue({ user: { id: ownerId } });
  const created = await repo.create({ collectionId, curatorId: ownerId });
  await repo.softDelete(created.id);
  const res = await createSession(jsonReq({ collectionId }) as any);
  expect(res.status).toBe(201);                      // was 409 under the old index
  expect(await repo.findByCollection(collectionId)).toHaveLength(1); // the new active one
});

it("201s a new create after the slot's session is COMPLETED", async () => {
  const { db } = getTestDb();
  const repo = new SessionRepository(db);
  const collectionId = await seedBareCollection(ownerId);
  mockGetSession.mockResolvedValue({ user: { id: ownerId } });
  const created = await repo.create({ collectionId, curatorId: ownerId });
  await repo.update(created.id, { status: "completed" });
  const res = await createSession(jsonReq({ collectionId }) as any);
  expect(res.status).toBe(201);
});

it("409s a create while a PAUSED session holds the slot (partial predicate includes paused)", async () => {
  const { db } = getTestDb();
  const repo = new SessionRepository(db);
  const collectionId = await seedBareCollection(ownerId);
  mockGetSession.mockResolvedValue({ user: { id: ownerId } });
  const created = await repo.create({ collectionId, curatorId: ownerId });
  await repo.update(created.id, { status: "paused" });
  const res = await createSession(jsonReq({ collectionId }) as any);
  expect(res.status).toBe(409);
});
```

(Update the file header comment to describe the NEW partial-index behaviour.) Also add an `abandoned` case mirroring `completed`.

- [ ] **Step 2: Run → the active+paused 409s pass, the new 201 cases FAIL** (restore/create not yet aligned to the partial index — actually create is already fine post-migration; the 201 cases should PASS once 0009 is applied. The FAILING piece is the restore test in Step 4). Run `npm run test:db -- src/lib/db/session-create-conflict.integration.test.ts` — expect the create cases to pass (migration 0009 from Task 1 is applied). If a 201 case still 409s, the migration didn't apply — stop and fix Task 1.

- [ ] **Step 3: Add `findInProgress`** to `ISessionRepository` (interface) and impl (mirror `findActive` but `status IN ('active','paused')`):

```ts
async findInProgress(collectionId: string, curatorId: string): Promise<Session | null> {
  const [session] = await this.db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.collectionId, collectionId),
        eq(sessionsTable.curatorId, curatorId),
        inArray(sessionsTable.status, ["active", "paused"]),
        isNull(sessionsTable.deletedAt),
      ),
    );
  return session ? this.mapToSession(session) : null;
}
```

(import `inArray` from `drizzle-orm`.)

- [ ] **Step 4: Make `restore` slot-aware.** In `SessionRepository.restore`, wrap the UPDATE in a try/catch that mirrors `create`'s conflict handling:

```ts
async restore(id: string): Promise<Session> {
  try {
    const [session] = await this.db
      .update(sessionsTable)
      .set({ deletedAt: null, status: "active", updatedAt: new Date() })
      .where(eq(sessionsTable.id, id))
      .returning();
    return this.mapToSession(session);
  } catch (error) {
    // The slot is held by a newer in-progress session (the partial index now
    // lets a set-aside session be superseded). Surface a gentle 409, not a 500.
    if (isCurrentSessionConflict(error)) throw new CurrentSessionExistsError();
    throw error;
  }
}
```

In `SessionController.restoreSession`, add the friendly pre-check (the `restore()` catch is the race backstop):

```ts
async restoreSession(sessionId: string): Promise<Session> {
  const target = await this.sessionRepo.findByIdIncludingDeleted(sessionId);
  if (target) {
    const inProgress = await this.sessionRepo.findInProgress(target.collectionId, target.curatorId);
    if (inProgress && inProgress.id !== sessionId) throw new CurrentSessionExistsError();
  }
  return this.sessionRepo.restore(sessionId);
}
```

In `src/app/api/sessions/[id]/restore/route.ts`, wrap the restore call:

```ts
try {
  const restored = await SessionController.fromDb(db).restoreSession(params.id);
  return NextResponse.json(restored);
} catch (error) {
  return errorResponse(error); // CurrentSessionExistsError -> 409
}
```

(import `errorResponse` from `@/server/api/http-errors`.)

- [ ] **Step 5: Undo UI 409 message.** In `ActiveSessionPanel.bringBack`, branch on the status so a 409 gets an accurate, gentle message:

```ts
const res = await fetch(`/api/sessions/${undo}/restore`, { method: "POST" });
if (res.status === 409) {
  setError("You've started a new sort since, so this one stays set aside.");
  return; // do not clear undo / refresh — there's nothing to bring back
}
if (!res.ok) throw new Error("restore failed");
```

(Keep the generic "give it another try" for other failures; keep the `finally` busy/inFlight reset.)

- [ ] **Step 6: New restore-conflict test** `src/lib/db/session-restore-conflict.integration.test.ts` (un-mocked, mirror the create-conflict header; import `POST as restoreSession` from the restore route + `POST as createSession`):
  - Set aside A (create + softDelete), then create B (new active). `POST /api/sessions/{A}/restore` → **409** (not 500); assert A stays soft-deleted (`findByIdIncludingDeleted(A).deletedAt` not null) and B unchanged (still the only live session).
  - Happy path: set aside A, restore A (slot free) → **200**, A active again.
  - `findInProgress` returns a paused session (create + update paused) and null when only terminal/deleted rows exist.

  > The restore route's auth: it requires `getSession` + collection access + `curatorId===userId`. Mock `@/lib/auth` getSession to the owner; seed via `seedBaseline`/`seedBareCollection`/`SessionRepository`. Mirror `session-restore-route.integration.test.ts` for the auth mock shape.

- [ ] **Step 7: Run** `npm run test:db -- src/lib/db/session-create-conflict.integration.test.ts src/lib/db/session-restore-conflict.integration.test.ts src/lib/db/session-restore-route.integration.test.ts` → all PASS. Then `npm run build` + `npm run lint`.

- [ ] **Step 8: Commit** — `fix(session): slot-aware restore (409 not 500) + findInProgress + reconcile conflict tests (purses-4bhh)`.

---

### Task 3: Paused session on the collection page (purses-ydeu)

**Files:**
- Modify: `src/app/collections/[id]/page.tsx` (`currentSession` active|paused; pass `status`)
- Modify: `src/features/sessions/ActiveSessionPanel.tsx` (status-aware: ResumeControl for paused, person-side copy, status badge)
- Test: `src/features/sessions/ActiveSessionPanel.test.tsx` (extend)

**Interfaces:**
- `ActiveSessionPanel` `SessionSummary` gains `status: "active" | "paused"`.
- Consumes `ResumeControl({ sessionId, sortHref })` (exists, `src/features/sorting/ResumeControl.tsx`).

- [ ] **Step 1: Failing component test** — extend `ActiveSessionPanel.test.tsx`:
  - For `session={{...,status:"paused"}}`: renders person-side paused copy ("Your sort is paused" / "Your sort is safe — pick up where you left off") and the Resume issues a **PATCH** `{status:"active"}` (ResumeControl), not a bare link navigation. (Mock fetch + useRouter; assert the PATCH on Resume click.)
  - For `session={{...,status:"active"}}`: unchanged — "Active Sorting Session", Resume is a link.
  - `bringBack` on a **409** shows "You've started a new sort since…" (from Task 2) and does NOT refresh; on a generic failure shows the retry message. (This may already be covered by a Task-2 test; keep one home for it.)

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/features/sessions/ActiveSessionPanel.test.tsx`.

- [ ] **Step 3: Implement `ActiveSessionPanel`** — add `status` to `SessionSummary`. In the card (non-confirming branch), render status-aware:
  - heading + body: active → "Active Sorting Session" + `{goal || "Preference discovery"}`; paused → "Your sort is paused" + "Your sort is safe — pick up where you left off."
  - `<Badge variant={session.status}>{session.status}</Badge>`.
  - Resume: active → `<Link href={resumeHref}><Button>Resume</Button></Link>` (unchanged); paused → `<ResumeControl sessionId={session.id} sortHref={resumeHref} />`.
  - Set aside / undo unchanged.

- [ ] **Step 4: Wire `collections/[id]/page.tsx`** — `const currentSession = sessions.find(s => s.status === "active" || s.status === "paused")`; pass `session={ currentSession ? { id, number, goal, status: currentSession.status } : null }` and `resumeHref` from `currentSession?.number`. (The panel stays mounted unconditionally — undo survival from PR2/PR3 is unchanged.)

- [ ] **Step 5: Run** `npx vitest run src/features/sessions/ActiveSessionPanel.test.tsx` → PASS. Then `npm run build` + `npm run lint`.

- [ ] **Step 6: Commit** — `feat(collections): surface paused sessions on the collection page with a real un-pause (purses-ydeu)`.

---

### Task 4: e2e (create-after-set-aside; paused collection card) + screenshots

**Files:**
- Create: `e2e/session-create-after-set-aside.spec.ts`
- Modify: `e2e/screenshots/capture.ts` (a "collection-paused" surface)

- [ ] **Step 1: e2e** (3 viewports; storageState auth; `**/photos/**/file*` intercept). Seed `seedJourneyScenario(ownerId, 2)`. Flow: go to the collection page or sort landing; set the active session aside; then start a **new** sort (the affordance that was gated/500ing) and assert it **succeeds** — lands on a triage URL, not a 409/500 error. (This is the purses-4bhh proof through the real UI.) Add a second check: with a paused session seeded, the collection page shows the paused card and its Resume returns to the sort.
- [ ] **Step 2: Run** `npx playwright test e2e/session-create-after-set-aside.spec.ts` (3 projects), then the FULL `npx playwright test` (the conflict-test/copy changes touch session flows). Then `npm run lint`.
- [ ] **Step 3: Screenshot surface** — add `["collection-paused", \`/collections/${pausedSlug}\`]` to `capture.ts` (seed a collection with a paused session, mirroring the existing `sort-paused` seed via `SessionRepository.update(id,{status:"paused"})`); capture light+dark.
- [ ] **Step 4: Commit** — `test(e2e): create-after-set-aside succeeds + paused collection card (purses-4bhh/ydeu)`.

---

## Final gate (before PR)
- [ ] build · test:ci · lint · auth:verify · `RUN_DB_TESTS=1` test:db · full e2e (3 viewports) — green
- [ ] `db:generate` reports no pending diff (the drift guard)
- [ ] `/sync-docs` (API.md: restore now 409 on a held slot; ARCHITECTURE: the partial-index redesign supersedes the purses-4bhh interim note) + `/graphify --update`
- [ ] Whole-branch `adversarial-review` (postgres / system-design / security / UX) → fold → re-verify
- [ ] Light+dark screenshots (the paused collection card) embedded in the PR
- [ ] Merge when green → `/close-out` (close purses-4bhh + purses-ydeu)

## Self-review (spec coverage)
§4.1 migration → Task 1. §4.4 slot-aware restore (catch + pre-check + route errorResponse + undo-UI 409) → Task 2. test reconcile + new restore-conflict test → Task 2. §4.2 `findInProgress` on the restore path (SessionService untouched/dead) → Task 2. §4.3 paused collection card (ResumeControl + person-side copy + status badge) → Task 3. e2e + screenshots → Task 4. **Tasks 1+2 merge together** (Task 1 alone ships the restore 500).
