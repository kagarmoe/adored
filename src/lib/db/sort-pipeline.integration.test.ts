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
import { SortResultService } from "@/server/services/SortResultService";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
// Flat-replace form: the spread form pulls in uninstalled nodemailer and errors.
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

// Routes imported via the @/ alias ([id] is a real dir).
import { POST as recordDecision } from "@/app/api/sessions/[id]/decisions/route";
import { POST as createResult } from "@/app/api/sort-results/route";

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
      { params: { id: sessionId } },
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
        { params: { id: session.id } },
      );
      expect(triageRes.status).toBe(201);
    }

    // Pairwise compare breaks the tie: itemA wins over itemB.
    const compareRes = await recordDecision(
      decisionReq({
        type: "pairwise_compare",
        decision: { itemAId: itemA.id, itemBId: itemB.id, result: "item_a" },
      }) as any,
      { params: { id: session.id } },
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

  it("createDraftResult materializes one item per preference, ranked by score", async () => {
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

    // Two preferences with distinct scores; highItem outranks lowItem.
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
    );
    const result = await service.createDraftResult(collectionId, ownerId, "Draft");

    // One SortResultItem per preference...
    const items = await new SortResultItemRepository(db).findByResult(result.id);
    expect(items).toHaveLength(2);

    // ...ranked by score: highest score is computedRank 0.
    const byRank = [...items].sort((a, b) => a.computedRank - b.computedRank);
    expect(byRank[0].itemId).toBe(highItem.id);
    expect(byRank[0].computedRank).toBe(0);
    expect(byRank[1].itemId).toBe(lowItem.id);
    expect(byRank[1].computedRank).toBe(1);
  });
});
