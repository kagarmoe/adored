# purgeCollection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use `- [ ]`.

**Goal:** Make `POST /api/collections/[id]/purge` a real owner-only permanent cascade purge of the entire collection (all 10 child tables → the collection, hard, in one transaction), writing a `collection.purge` audit row and cleaning up blobs.

**Architecture:** A `CollectionPurgeService` mirroring `ItemPurgeService` one level up: `withTransaction` deletes deepest-child-first via tx-bound repos, records the audit row in the same tx, then `del`s blobs best-effort post-commit. 12 thin by-collection repo methods. The route resolves the collection **including soft-deleted** + checks ownership inline.

**Tech Stack:** Next.js App Router, Drizzle + postgres-js (real transactions), Vitest (`RUN_DB_TESTS` DB tier), `@vercel/blob`.

**Spec:** `docs/superpowers/specs/2026-06-20-purgecollection-design.md` (rev-2, adversarial-reviewed — Data CLEAN, Security/Architect/QA CONCERNS folded).

## Global Constraints
- Commit on `feat/purge-collection`; never touch main. graphify-first for exploration. Don't commit `.claude/settings.json` / `graphify-out/` in task commits.
- TDD: failing test first, run + confirm RED, then minimal code. **Avoid mocking** — the authoritative proof is the un-mocked full-collection DB integration test (mock ONLY `@/lib/auth`, `@/lib/db`, `@vercel/blob` `del`). The atomicity test's `vi.spyOn(CollectionRepository.prototype, "hardDelete")` is the one sanctioned exception.
- **Total-erase** — no 409 block; deletes draft AND finalized results across all curators.
- **Resolve INCLUDING soft-deleted** (`CollectionRepository.findByIdIncludingDeleted`) — the canonical path is `DELETE` (soft) → purge; a `findById` that filters `deletedAt` would make a soft-deleted collection un-purgeable.
- **Confirm = the collection name**, compared server-side against the DB-resolved row (never a client-echoed name). Authz precedes body parsing.
- **Tx-binding is structural:** every write in steps 1–11 + the audit write is `new XRepository(tx)`. No write on the injected `db`.
- **No inner try/catch** around `service.purge` — a cascade failure propagates to the route's outer catch → 500.
- Reuses `audit_log` (`purses-ite`) — **no migration**. `audit_log` has no FK (its `collectionId` intentionally outlives the deleted collection).
- Cascade order (load-bearing — no `ON DELETE CASCADE`): `sort_result_shares → sort_result_items → sort_results → decision_events → sessions → preferences → photos → items → invitations → memberships → collections`.

---

### Task 1: 12 by-collection repo methods

**Files (modify interface + impl for each; tables already imported in most — add `inArray`/parent-table imports where a subquery needs them):**
- `SortResultShareRepository`, `SortResultItemRepository`, `SortResultRepository`, `DecisionEventRepository`, `SessionRepository`, `CollectionPreferenceItemRepository`, `PhotoRepository`, `ItemRepository`, `InvitationRepository`, `MembershipRepository`, `CollectionRepository` (+ their interfaces under `src/server/repositories/I*.ts` where one exists).

**Interfaces produced (consumed by Tasks 2–4):**
- `deleteByCollection(collectionId: string): Promise<void>` on: SortResultShare, SortResultItem, SortResult, DecisionEvent, Session, CollectionPreferenceItem, Invitation, Membership repos.
- `PhotoRepository.hardDeleteByCollection(collectionId): Promise<string[]>` (blob keys).
- `ItemRepository.hardDeleteByCollection(collectionId): Promise<number>` (count).
- `CollectionRepository.findByIdIncludingDeleted(collectionId): Promise<Collection | null>` and `hardDelete(collectionId): Promise<void>`.

- [ ] **Step 1:** graphify + Read each impl to confirm the imports it already has (`eq`/`and`/`inArray`/its table) and its `mapTo*`. The single-id precedents to mirror: `ItemRepository.findByIdIncludingDeleted` (L78), `ItemRepository.hardDelete` (L146), the subquery shape in `SortResultItemRepository.deleteByItemInDraftResults`.

- [ ] **Step 2: Implement the simple by-collection deletes** (direct `collection_id` column):

```ts
// SortResultRepository
async deleteByCollection(collectionId: string): Promise<void> {
  await this.db.delete(sortResultsTable).where(eq(sortResultsTable.collectionId, collectionId));
}
// SessionRepository
async deleteByCollection(collectionId: string): Promise<void> {
  await this.db.delete(sessionsTable).where(eq(sessionsTable.collectionId, collectionId));
}
// CollectionPreferenceItemRepository — all curators (distinct from clear/deleteByItem)
async deleteByCollection(collectionId: string): Promise<void> {
  await this.db.delete(preferencesTable).where(eq(preferencesTable.collectionId, collectionId));
}
// InvitationRepository
async deleteByCollection(collectionId: string): Promise<void> {
  await this.db.delete(invitationsTable).where(eq(invitationsTable.collectionId, collectionId));
}
// MembershipRepository
async deleteByCollection(collectionId: string): Promise<void> {
  await this.db.delete(membershipsTable).where(eq(membershipsTable.collectionId, collectionId));
}
```

- [ ] **Step 3: Implement the subquery-scoped deletes** (no `collection_id` column — scope via the parent). Import `inArray` + the parent table where missing:

```ts
// SortResultShareRepository — shares of this collection's results
async deleteByCollection(collectionId: string): Promise<void> {
  await this.db.delete(sortResultSharesTable).where(
    inArray(
      sortResultSharesTable.sortResultId,
      this.db.select({ id: sortResultsTable.id }).from(sortResultsTable)
        .where(eq(sortResultsTable.collectionId, collectionId)),
    ),
  );
}
// SortResultItemRepository — result-items of this collection's results
async deleteByCollection(collectionId: string): Promise<void> {
  await this.db.delete(sortResultItemsTable).where(
    inArray(
      sortResultItemsTable.sortResultId,
      this.db.select({ id: sortResultsTable.id }).from(sortResultsTable)
        .where(eq(sortResultsTable.collectionId, collectionId)),
    ),
  );
}
// DecisionEventRepository — decisions of this collection's sessions
async deleteByCollection(collectionId: string): Promise<void> {
  await this.db.delete(decisionEventsTable).where(
    inArray(
      decisionEventsTable.sessionId,
      this.db.select({ id: sessionsTable.id }).from(sessionsTable)
        .where(eq(sessionsTable.collectionId, collectionId)),
    ),
  );
}
```

- [ ] **Step 4: Implement the RETURNING + count + collection methods:**

```ts
// PhotoRepository — hard delete ALL photo rows (incl. soft-deleted), return blob keys
async hardDeleteByCollection(collectionId: string): Promise<string[]> {
  const rows = await this.db.delete(photosTable)
    .where(eq(photosTable.collectionId, collectionId))
    .returning({ blobKey: photosTable.blobKey });
  return rows.map((r) => r.blobKey);
}
// ItemRepository — hard delete ALL items of the collection, return the count
async hardDeleteByCollection(collectionId: string): Promise<number> {
  const rows = await this.db.delete(itemsTable)
    .where(eq(itemsTable.collectionId, collectionId))
    .returning({ id: itemsTable.id });
  return rows.length;
}
// CollectionRepository — resolve including soft-deleted (no deletedAt filter); mirror findById's mapToCollection
async findByIdIncludingDeleted(id: string): Promise<Collection | null> {
  const [row] = await this.db.select().from(collectionsTable).where(eq(collectionsTable.id, id));
  return row ? this.mapToCollection(row) : null;
}
async hardDelete(id: string): Promise<void> {
  await this.db.delete(collectionsTable).where(eq(collectionsTable.id, id));
}
```

(Read `CollectionRepository.findById` to copy its exact `mapToCollection(row)` call; do not invent a mapper.)

- [ ] **Step 5: Update the interfaces** (`I*Repository.ts`) for every method above so the impl/interface agree (strict-mode build fails otherwise).

- [ ] **Step 6:** `npm run test:ci` (no regression) + `npx tsc --noEmit` clean on touched files. The deletes' authoritative coverage is Task 4; add a focused unit only where a repo already has a `*.alloc.test.ts` and the method fits.

- [ ] **Step 7: Commit** `feat(repo): by-collection cascade deletes + Collection findByIdIncludingDeleted/hardDelete (purgeCollection)`.

---

### Task 2: `CollectionPurgeService`

**Files:** Create `src/server/services/CollectionPurgeService.ts`.

**Interfaces:**
- Consumes: all Task 1 methods; `withTransaction`; `AuditLogRepository.record`; `del` from `@vercel/blob`; `Collection` from `@/types`; `Database` from `@/lib/db`.
- Produces: `CollectionPurgeService.purge(collection: Collection, actorId: string): Promise<void>`.

- [ ] **Step 1:** graphify + Read `src/server/services/ItemPurgeService.ts` — mirror its structure, the tx-bound-invariant doc comment, and the post-commit blob block verbatim (adapting names).

- [ ] **Step 2: Implement** (the service is tested via the route in Task 4 — no separate unit; its proof is the un-mocked integration test):

```ts
import type { Database } from "@/lib/db";
import type { Collection } from "@/types";
import { withTransaction } from "@/lib/transactions";
import { del } from "@vercel/blob";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { AuditLogRepository } from "@/server/repositories/implementations/AuditLogRepository";

/**
 * Permanent owner-decided erasure of a WHOLE collection. The route has resolved
 * the collection (incl. soft-deleted) and gated the caller as its owner; this
 * service does the destructive work. Total-erase: every curator's sessions,
 * preferences, and sort results (draft + finalized) go.
 *
 * Children-first hard delete in ONE transaction (no FK has ON DELETE CASCADE),
 * then a collection.purge audit row in the SAME tx (a committed purge always
 * carries its actor record). Blobs are del'd best-effort AFTER commit.
 *
 * Invariant: inside the transaction, EVERY write goes through a tx-bound repo
 * (`new XRepository(tx)`), never an injected/`this.db` repo — a non-tx write
 * would not roll back with the transaction.
 */
export class CollectionPurgeService {
  constructor(private db: Database) {}

  async purge(collection: Collection, actorId: string): Promise<void> {
    const blobKeys = await withTransaction(this.db, async (tx) => {
      await new SortResultShareRepository(tx).deleteByCollection(collection.id);
      await new SortResultItemRepository(tx).deleteByCollection(collection.id);
      await new SortResultRepository(tx).deleteByCollection(collection.id);
      await new DecisionEventRepository(tx).deleteByCollection(collection.id);
      await new SessionRepository(tx).deleteByCollection(collection.id);
      await new CollectionPreferenceItemRepository(tx).deleteByCollection(collection.id);
      const keys = await new PhotoRepository(tx).hardDeleteByCollection(collection.id);
      const itemsDeleted = await new ItemRepository(tx).hardDeleteByCollection(collection.id);
      await new InvitationRepository(tx).deleteByCollection(collection.id);
      await new MembershipRepository(tx).deleteByCollection(collection.id);
      await new CollectionRepository(tx).hardDelete(collection.id);
      await new AuditLogRepository(tx).record({
        actorId,
        action: "collection.purge",
        targetType: "collection",
        targetId: collection.id,
        collectionId: collection.id,
        metadata: { photosDeleted: keys.length, itemsDeleted },
      });
      return keys;
    });

    // Best-effort, post-commit. Only http(s) keys are real blob URLs; a del
    // rejection is logged, not fatal — the DB purge already committed.
    const results = await Promise.allSettled(
      blobKeys.filter((k) => k.startsWith("http")).map((k) => del(k)),
    );
    for (const r of results) {
      if (r.status === "rejected") {
        console.error("CollectionPurgeService: blob del failed (orphaned, sweepable)", r.reason);
      }
    }
  }
}
```

- [ ] **Step 3:** `npx tsc --noEmit` clean on the new file (all repo method names/types match Task 1). Commit `feat(collections): CollectionPurgeService — transactional cascade purge + audit + blobs`.

---

### Task 3: Rewire the route + remove the stub

**Files:**
- Modify: `src/app/api/collections/[id]/purge/route.ts`
- Modify: `src/server/api/collections.ts` (remove `purgeCollection` + the now-unused `PurgeConfirmSchema` if nothing else uses it)

**Interfaces:** Consumes `CollectionRepository.findByIdIncludingDeleted` (Task 1), `CollectionPurgeService.purge` (Task 2).

- [ ] **Step 1: Rewrite the route** (resolve-including-deleted → inline owner check → name confirm; no inner try/catch):

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { CollectionPurgeService } from "@/server/services/CollectionPurgeService";

const ConfirmSchema = z.object({ confirm: z.string() });

// Permanent owner-only cascade purge. Order matters for security: authenticate,
// resolve the collection INCLUDING soft-deleted (the canonical path is
// DELETE -> purge), gate as the OWNER, and ONLY THEN parse the confirm body —
// which must echo the exact collection name. A non-owner with any body gets
// 403/404, never a 400 that leaks the collection's existence or name.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireAuth();
    const db = getDb();

    const collection = await new CollectionRepository(db).findByIdIncludingDeleted(params.id);
    if (!collection) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (collection.ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = ConfirmSchema.safeParse(body);
    if (!parsed.success || parsed.data.confirm !== collection.name) {
      return NextResponse.json(
        { error: "Type the collection name to confirm" },
        { status: 400 },
      );
    }

    await new CollectionPurgeService(db).purge(collection, user.id);
    return NextResponse.json({ message: "Collection purged" });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status },
    );
  }
}
```

- [ ] **Step 2: Remove the stub** — delete `CollectionController.purgeCollection` from `src/server/api/collections.ts`, and remove `PurgeConfirmSchema` there if grep shows no other use. Confirm no other caller of `controller.purgeCollection` remains (`grep -rn "purgeCollection" src`).

- [ ] **Step 3:** `npm run build` + `npx tsc --noEmit` clean. Commit `feat(api): real owner-only collection purge — include-deleted resolve + name confirm (purgeCollection)`.

---

### Task 4: Un-mocked DB integration test

**Files:** Create `src/lib/db/collection-purge.integration.test.ts`.

- [ ] **Step 1:** graphify + Read `src/lib/db/audit-log.integration.test.ts` and `src/lib/db/item-purge.integration.test.ts` for the `describeDb` gate, the auth/db/blob mocks (`vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }))`), the session-switching pattern, and `seedBaseline`. Read `sort-results-authz.integration.test.ts` for how a **finalized** result + a `sort_result_share` are seeded, and how a 2nd member + `MembershipRepository` row is created.

- [ ] **Step 2: Write the failing tests.** Seed via the real repos a FULL collection owned by `owner`: a 2nd member (membership row); ≥2 items; ≥2 photos (real http `blobKey`s, one soft-deleted); a session + ≥1 `decision_event`; the 2nd member's preferences; a **draft** result + items; a **finalized** result + items + a `sort_result_share`; **≥1 `invitations` row**. Capture the seeded ids. Helpers — count by collection directly where the column exists; **for `decision_events`/`sort_result_items`/`sort_result_shares` count via the subquery form**, e.g.:

```ts
const countDecisions = (cid: string) => getTestDb().db.execute(
  sql`SELECT count(*)::int AS n FROM decision_events WHERE session_id IN (SELECT id FROM sessions WHERE collection_id = ${cid})`,
).then((r) => (r as any)[0].n);
// likewise sort_result_items / sort_result_shares via sort_result_id IN (SELECT id FROM sort_results WHERE collection_id = ...)
```

Cases (all drive the real `POST` route as the acting user; assert on real rows):
1. **Total cascade:** owner, body `{ confirm: collection.name }` → `200`; **every** table empty for the collection — items, photos, preferences, sessions, decision_events, sort_results, sort_result_items, sort_result_shares, invitations, memberships all `0`, and `findByIdIncludingDeleted(collectionId)` is `null` (collection hard-gone); exactly **one** `audit_log` row (`new AuditLogRepository(db).findByCollection(collectionId)` → length 1, `action:"collection.purge"`, `actorId === owner.id`, `metadata` counts match the seed); `del` called once per http blob key (incl. the soft-deleted photo's).
2. **Soft-delete → purge:** `new CollectionRepository(db).softDelete(collectionId)` first, then owner purge with the name → `200`, everything empty (proves include-deleted resolution).
3. **Atomicity (named injection):** `vi.spyOn(CollectionRepository.prototype, "hardDelete").mockRejectedValueOnce(new Error("boom"))`; owner purge → `500`; assert **nothing** deleted — items/photos/sessions/results/etc. all still at their seeded counts, the collection still present, **zero** audit rows. `spy.mockRestore()`.
4. **Authz/confirm:** non-owner member → `403` (everything survives); absent id → `404`; owner with `{ confirm: "wrong" }` → `400` (nothing deleted); non-owner with `{ confirm: "wrong" }` → `403` (authz precedes confirm).

- [ ] **Step 3: Run — RED:** `./e2e/fixtures/test-db.sh up && npm run test:db -- collection-purge` → FAIL (route still calls the stub; methods missing). *(If Tasks 1–3 are already merged into the branch, the cascade cases pass and only refinements remain — but write the tests to fail against the stub baseline.)*

- [ ] **Step 4: Run — GREEN** (after Tasks 1–3): `npm run test:db -- collection-purge` all pass + `npm run test:db -- item-purge audit-log` (no regression) + `npm run test:ci`.

- [ ] **Step 5: Commit** `test(collections): un-mocked collection-purge cascade + atomicity + authz (purgeCollection)`.

---

### Task 5: Doc-sync + acceptance gate

**Files:** `docs/API.md`, `docs/ARCHITECTURE.md`.

- [ ] **Step 1: `docs/API.md`** — rewrite the `POST /api/collections/[id]/purge` entry: now a **real** owner-only cascade purge — resolve-including-soft-deleted → inline owner check (404/403) → confirm must equal the collection **name** (400 otherwise) → hard-deletes the entire collection (all child tables) + a `collection.purge` audit row in one tx, blobs best-effort post-commit; `200 { message }`. Remove the "still a stub" note wherever it appears (the items-purge entry references it).

- [ ] **Step 2: `docs/ARCHITECTURE.md`** — update the purge bullet: `purgeCollection` is now realized (the collection-level sibling of item purge); note the cascade order, total-erase, the `collection.purge` audit row, and that the collection row is hard-deleted.

- [ ] **Step 3: Acceptance gate** (all green):
```bash
npm run test:ci
npm run test:db -- collection-purge
npm run test:db -- item-purge audit-log     # no regression
npm run lint
npm run build
grep -rn "it\.fails\|test\.fails\|test\.only\|describe\.only" src | grep -i "purge\|collection" || echo none
```

- [ ] **Step 4: Commit** `docs: real collection purge — cascade + audit (purgeCollection)`.

---

## Self-Review

**Spec coverage:** 12 repo methods (T1) ✓ · CollectionPurgeService cascade + audit + blobs + tx-invariant (T2) ✓ · route include-deleted resolve + inline owner + name confirm + no inner try/catch + stub removal (T3) ✓ · full-collection un-mocked test with non-vacuous every-table assertions (incl. seeded invitation) + subquery counts + soft-delete→purge + named atomicity injection + authz/confirm (T4) ✓ · doc-sync + gate (T5) ✓ · no migration (reuses audit_log) ✓ · total-erase / no 409 ✓.

**Type consistency:** `deleteByCollection → Promise<void>` (8 repos); `PhotoRepository.hardDeleteByCollection → Promise<string[]>`; `ItemRepository.hardDeleteByCollection → Promise<number>`; `CollectionRepository.findByIdIncludingDeleted → Promise<Collection|null>` / `hardDelete → Promise<void>`; `CollectionPurgeService.purge(collection: Collection, actorId: string)`; `AuditLogRepository.record({action:"collection.purge", targetType:"collection", metadata:{photosDeleted,itemsDeleted}})` — all consistent T1↔T2↔T4.

**Placeholder scan:** every repo method + the service + the route have complete code; the test defers only the seed boilerplate to the named model files (item-purge / audit-log / sort-results-authz), which define `seedBaseline` + the finalized-result/share/membership seeding concretely. The subquery count helper is spelled out. No TBD/TODO.
