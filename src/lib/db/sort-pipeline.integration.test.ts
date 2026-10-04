// src/lib/db/sort-pipeline.integration.test.ts
//
// Task 12: characterize the sort pipeline across the real DB seam (always-on
// db-tests tier). Two slices:
//   1) A triage decision recorded through the REAL decisions route persists a
//      CollectionPreferenceItem in the RIGHT bucket (persistence + bucket
//      direction only — ScoringService's unit tests own the score arithmetic).
//   2) SortResultService.createDraftResult materializes one SortResultItem per
//      preference, ranked by score.
//
// Mirrors triage-decision.integration.test.ts: describeDb / resetDb / seedBaseline,
// real repos across the seam, mocking only the two true boundaries (auth + db).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { SortResultService } from "@/server/services/SortResultService";
import type { CollectionPreferenceItem } from "@/types";

const { mockGetSession, UnauthorizedError } = vi.hoisted(() => {
  class UnauthorizedError extends Error {
    constructor(message = "Unauthorized") { super(message); this.name = "UnauthorizedError"; }
  }
  return { mockGetSession: vi.fn(), UnauthorizedError };
});
// Flat-replace form: the spread form pulls in uninstalled nodemailer and errors.
// requireAuth mirrors the real impl (getSession -> user, else throw) so routes
// that gate via requireAuth (e.g. the DELETE handler) work under the same mock.
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireAuth: async () => {
    const session = await mockGetSession();
    if (!session?.user) throw new Error("Unauthorized");
    return session.user;
  },
  UnauthorizedError,
}));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

// Routes imported via the @/ alias ([id] is a real dir).
import { POST as recordDecision } from "@/app/api/sessions/[id]/decisions/route";
import { POST as createResult } from "@/app/api/sort-results/route";
import { DELETE as deleteResultRoute } from "@/app/api/sort-results/[id]/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function decisionReq(body: unknown): Request {
  return new Request("http://localhost/api/sessions/x/decisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describeDb("sort pipeline (route/service -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  /** Seed a collection + one item + an active session whose curator is `curatorId`. */
  async function seedCollectionItemSession(curatorId: string) {
    const { db } = getTestDb();
    const collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Pipeline repro', 'active', now(), now())
    `);
    const item = await new ItemRepository(db).create({ collectionId });
    const session = await new SessionRepository(db).create({ collectionId, curatorId });
    return { collectionId, itemId: item.id, sessionId: session.id };
  }

  it("triage decision persists a preference in the right bucket", async () => {
    const { db } = getTestDb();
    const { collectionId, itemId, sessionId } = await seedCollectionItemSession(ownerId);

    // Record a "top" triage through the REAL route (route -> ScoringService ->
    // PreferenceStateService -> repo), crossing the seam un-mocked.
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await recordDecision(
      decisionReq({ type: "triage", decision: { itemId, result: "top" } }) as any,
      { params: Promise.resolve({ id: sessionId }) },
    );
    expect(res.status).toBe(201);

    // Persisted row + bucket DIRECTION only. A "top" triage must land in the "top"
    // bucket; the exact score is ScoringService's unit-test territory, not ours.
    const pref = await new CollectionPreferenceItemRepository(db).findByItem(itemId, ownerId);
    expect(pref).not.toBeNull();
    expect(pref!.collectionId).toBe(collectionId);
    expect(pref!.rankBucket).toBe("top");
  });

  it("live POST /api/sort-results ranks the pairwise winner above the loser (triage + compare)", async () => {
    // End-to-end across the real seam, BOTH decision types: triage seeds itemA and
    // itemB into the SAME tier (so triage alone leaves them tied), then a pairwise
    // compare with itemA the winner breaks the tie. The live POST /api/sort-results
    // must then materialize result items whose computed ranks reflect that order:
    // the winner outranks the loser. computedRank is 0-based (0 = best).
    const { db } = getTestDb();
    const collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Pairwise pipeline', 'active', now(), now())
    `);
    const itemRepo = new ItemRepository(db);
    const itemA = await itemRepo.create({ collectionId });
    const itemB = await itemRepo.create({ collectionId });
    const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Triage both into the SAME tier ("high") — tied on triage alone.
    for (const itemId of [itemA.id, itemB.id]) {
      const triageRes = await recordDecision(
        decisionReq({ type: "triage", decision: { itemId, result: "high" } }) as any,
        { params: Promise.resolve({ id: session.id }) },
      );
      expect(triageRes.status).toBe(201);
    }

    // Pairwise compare breaks the tie: itemA wins over itemB.
    const compareRes = await recordDecision(
      decisionReq({
        type: "pairwise_compare",
        decision: { itemAId: itemA.id, itemBId: itemB.id, result: "item_a" },
      }) as any,
      { params: Promise.resolve({ id: session.id }) },
    );
    expect(compareRes.status).toBe(201);

    // Drive the live POST /api/sort-results route (the repaired seam).
    const res = await createResult(
      new Request("http://localhost/api/sort-results", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collectionId, name: "Pairwise ranking" }),
      }) as any,
    );
    expect(res.status).toBe(201);
    const resultId = (await res.json()).id as string;

    const items = await new SortResultItemRepository(db).findByResult(resultId);
    const winner = items.find((i) => i.itemId === itemA.id)!;
    const loser = items.find((i) => i.itemId === itemB.id)!;
    expect(winner.computedRank).toBeLessThan(loser.computedRank);
  });

  it("createDraftResult materializes one item per preference, ranked by orderRank within a bucket", async () => {
    // Characterizes the INTENDED-but-unwired service path: SortResultService is
    // orphaned (the live POST /api/sort-results route never calls it — see the
    // RED seam tripwire in sort-results-authz.integration.test.ts). This is the
    // future-repair target the live seam should eventually delegate to, NOT the
    // live-seam guard. We exercise the service directly with real repos.
    const { db } = getTestDb();
    const collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Draft result', 'active', now(), now())
    `);
    const itemRepo = new ItemRepository(db);
    const lowItem = await itemRepo.create({ collectionId });
    const highItem = await itemRepo.create({ collectionId });

    // Two co-bucketed "top" preferences sharing a score, ordered ONLY by
    // orderRank: highItem (0) outranks lowItem (1). Same bucket + same score, so
    // the finalize order is decided purely by orderRank (Epic 0 Task 10), not by
    // the retired score sort.
    const prefRepo = new CollectionPreferenceItemRepository(db);
    await prefRepo.create({
      collectionId, curatorId: ownerId, itemId: lowItem.id,
      score: 0.875, confidence: 1, rankBucket: "top", comparisonCount: 0,
      orderRank: 1,
    });
    await prefRepo.create({
      collectionId, curatorId: ownerId, itemId: highItem.id,
      score: 0.875, confidence: 1, rankBucket: "top", comparisonCount: 0,
      orderRank: 0,
    });

    const service = new SortResultService(
      new SortResultRepository(db),
      new SortResultItemRepository(db),
      prefRepo,
      db,
    );
    const result = await service.createDraftResult(collectionId, ownerId, "Draft");

    // One SortResultItem per preference...
    const items = await new SortResultItemRepository(db).findByResult(result.id);
    expect(items).toHaveLength(2);

    // ...ranked by orderRank: orderRank 0 is computedRank 0.
    const byRank = [...items].sort((a, b) => a.computedRank - b.computedRank);
    expect(byRank[0].itemId).toBe(highItem.id);
    expect(byRank[0].computedRank).toBe(0);
    expect(byRank[1].itemId).toBe(lowItem.id);
    expect(byRank[1].computedRank).toBe(1);
  });

  it("createDraftResult rolls back the whole materialization when an item INSERT fails (atomicity)", async () => {
    // AUTHORITATIVE un-mocked transactional-rollback proof. We seed ONE real
    // item + a real high-score preference for it, and feed the service a
    // SECOND, lower-score preference whose itemId is fabricated and does NOT
    // exist in `items`. Both rows go in one multi-row sort_result_items INSERT,
    // which trips the item_id FK (23503) after the result row is written, on attempt 1 (23503 is NOT a number conflict, so it
    // propagates, no retry). The fabricated preference is an in-memory object,
    // never persisted: preferences.item_id is itself a hard FK to items.id, so
    // a dangling preference row is impossible at the DB level. Only the
    // upstream preference READ is faked; the entire WRITE path (result row +
    // the item INSERT) runs on the REAL db/tx with real tx-bound repos.
    const { db } = getTestDb();
    const collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Rollback repro', 'active', now(), now())
    `);
    const realItem = await new ItemRepository(db).create({ collectionId });

    const ghostItemId = generateId("item"); // never inserted into `items`
    const now = new Date();
    const fakePreferenceRepo = {
      findByCollection: async (): Promise<CollectionPreferenceItem[]> => [
        // Higher score → computedRank 0 → a valid row in the multi-row INSERT.
        {
          id: generateId("pref"), collectionId, curatorId: ownerId,
          itemId: realItem.id, score: 0.9, confidence: 1, rankBucket: "top",
          comparisonCount: 0, lastSeen: now, createdAt: now, updatedAt: now,
        },
        // Lower score → computedRank 1 → its dangling item_id fails the INSERT (23503).
        {
          id: generateId("pref"), collectionId, curatorId: ownerId,
          itemId: ghostItemId, score: 0.1, confidence: 1, rankBucket: "low",
          comparisonCount: 0, lastSeen: now, createdAt: now, updatedAt: now,
        },
      ],
    } as unknown as CollectionPreferenceItemRepository;

    const service = new SortResultService(
      new SortResultRepository(db),
      new SortResultItemRepository(db),
      fakePreferenceRepo,
      db,
    );

    await expect(
      service.createDraftResult(collectionId, ownerId, "Doomed draft"),
    ).rejects.toThrow();

    // Nothing committed: no result row for the collection, and no item rows.
    // Collection-scoped emptiness — the call threw, so there is no returned id.
    expect(await new SortResultRepository(db).findByCollection(collectionId)).toEqual([]);
    const [{ count }] = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM sort_result_items sri
      JOIN sort_results sr ON sr.id = sri.sort_result_id
      WHERE sr.collection_id = ${collectionId}
    `);
    expect(count).toBe(0);
  });

  it("supersedeResult clones a finalized result's items into a new draft", async () => {
    // Un-mocked clone proof across the real DB seam: a finalized result's items
    // must be copied verbatim into a fresh draft. Same item count, status "draft".
    const { db } = getTestDb();
    const collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Supersede clone', 'active', now(), now())
    `);
    const itemRepo = new ItemRepository(db);
    const lowItem = await itemRepo.create({ collectionId });
    const highItem = await itemRepo.create({ collectionId });

    const prefRepo = new CollectionPreferenceItemRepository(db);
    await prefRepo.create({
      collectionId, curatorId: ownerId, itemId: lowItem.id,
      score: 0.375, confidence: 1, rankBucket: "medium", comparisonCount: 0,
    });
    await prefRepo.create({
      collectionId, curatorId: ownerId, itemId: highItem.id,
      score: 0.875, confidence: 1, rankBucket: "top", comparisonCount: 0,
    });

    const service = new SortResultService(
      new SortResultRepository(db),
      new SortResultItemRepository(db),
      prefRepo,
      db,
    );

    // Populate a draft, finalize it, then supersede it.
    const draft = await service.createDraftResult(collectionId, ownerId, "To finalize");
    const sourceItems = await new SortResultItemRepository(db).findByResult(draft.id);
    expect(sourceItems).toHaveLength(2);
    await service.finalizeResult(draft.id);

    const revision = await service.supersedeResult(draft.id);
    expect(revision).not.toBeNull();
    expect(revision!.status).toBe("draft");
    expect(revision!.id).not.toBe(draft.id);

    // The revision is a fresh draft carrying the SAME item count as the source.
    const revisionItems = await new SortResultItemRepository(db).findByResult(revision!.id);
    expect(revisionItems).toHaveLength(sourceItems.length);
  });

  /** Seed a populated draft result (one item per preference) owned by `ownerId`. */
  async function seedPopulatedDraft() {
    const { db } = getTestDb();
    const collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Delete repro', 'active', now(), now())
    `);
    const itemRepo = new ItemRepository(db);
    const lowItem = await itemRepo.create({ collectionId });
    const highItem = await itemRepo.create({ collectionId });

    const prefRepo = new CollectionPreferenceItemRepository(db);
    await prefRepo.create({
      collectionId, curatorId: ownerId, itemId: lowItem.id,
      score: 0.375, confidence: 1, rankBucket: "medium", comparisonCount: 0,
    });
    await prefRepo.create({
      collectionId, curatorId: ownerId, itemId: highItem.id,
      score: 0.875, confidence: 1, rankBucket: "top", comparisonCount: 0,
    });

    const service = new SortResultService(
      new SortResultRepository(db),
      new SortResultItemRepository(db),
      prefRepo,
      db,
    );
    return service.createDraftResult(collectionId, ownerId, "To delete");
  }

  it("DELETE /api/sort-results/[id] removes a shared draft, ALL its items and its share (zero orphans)", async () => {
    const { db } = getTestDb();
    const draft = await seedPopulatedDraft();

    // The draft is populated and shared before deletion (neither FK cascades, so a
    // bare result delete fails unless the children are removed first).
    expect((await new SortResultItemRepository(db).findByResult(draft.id)).length).toBeGreaterThan(0);
    await new SortResultShareRepository(db).create({ sortResultId: draft.id, shareToken: `share-tok-${generateId("tok")}` });

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await deleteResultRoute(new Request(`http://localhost/api/sort-results/${draft.id}`, {
      method: "DELETE",
    }) as any, { params: Promise.resolve({ id: draft.id }) });
    expect(res.status).toBe(200);

    // Result row gone AND no orphaned child items left behind.
    expect(await new SortResultRepository(db).findById(draft.id)).toBeNull();
    expect(await new SortResultItemRepository(db).findByResult(draft.id)).toEqual([]);
    expect(await new SortResultShareRepository(db).findByResult(draft.id)).toEqual([]);
  });

  it("deleteResult rolls back the child deletes when the result delete fails (atomicity)", async () => {
    // Un-mocked transactional-rollback proof for the DELETE path: deleteResult
    // removes the children (shares, items) FIRST, then the result — so a failure
    // on the result row lands AFTER the child deletes. With withTransaction
    // wrapping all of them, the whole thing rolls back and the items survive.
    const { db } = getTestDb();
    const draft = await seedPopulatedDraft();

    const itemRepo = new SortResultItemRepository(db);
    const before = await itemRepo.findByResult(draft.id);
    expect(before.length).toBeGreaterThan(0);

    const service = new SortResultService(
      new SortResultRepository(db),
      new SortResultItemRepository(db),
      new CollectionPreferenceItemRepository(db),
      db,
    );

    const spy = vi.spyOn(SortResultRepository.prototype, "delete").mockRejectedValueOnce(new Error("result delete failed"));
    await expect(service.deleteResult(draft.id)).rejects.toThrow("result delete failed");
    spy.mockRestore();

    // The point: the transaction rolled back, so EVERY item row still exists
    // (the children delete ran, then the result delete FK-failed → full undo).
    const after = await itemRepo.findByResult(draft.id);
    expect(after).toHaveLength(before.length);
    // And the result row itself survives too.
    expect(await new SortResultRepository(db).findById(draft.id)).not.toBeNull();
  });

  it("DELETE /api/sort-results/[id] rejects a finalized result with 409 and leaves it intact", async () => {
    const { db } = getTestDb();
    const draft = await seedPopulatedDraft();

    const service = new SortResultService(
      new SortResultRepository(db),
      new SortResultItemRepository(db),
      new CollectionPreferenceItemRepository(db),
      db,
    );
    await service.finalizeResult(draft.id);

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await deleteResultRoute(new Request(`http://localhost/api/sort-results/${draft.id}`, {
      method: "DELETE",
    }) as any, { params: Promise.resolve({ id: draft.id }) });
    expect(res.status).toBe(409);

    // Finalized result must survive a delete attempt.
    expect(await new SortResultRepository(db).findById(draft.id)).not.toBeNull();
  });
});
