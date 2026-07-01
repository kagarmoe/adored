// src/lib/db/pairwise-ranking.integration.test.ts
//
// Regression guard (spec §6.4 / purses-o93, guarding purses-h02): a pairwise
// compare must be recorded and flow through the REAL decisions seam into the
// materialized preference rows — never dropped on the floor (the purses-h02 bug).
//
// end-to-end ranking order is now via orderRank + finalize (Epic 0 Tasks 7/10),
// covered in binary-insertion-ranking.integration.test.ts. Under binary-insertion
// ranking (Epic 0), a pairwise compare no longer moves `score`: two items triaged
// to the SAME tier share the same score and bucket, and the eventual ORDER between
// them is decided by `orderRank` (Task 7) read by finalize (Task 10) — not by an
// Elo delta on score. So this guard now pins the invariant that still holds today:
// the pairwise compare is DURABLY RECORDED as evidence on both items' preference
// rows (comparisonCount incremented), and same-tier triage leaves them co-bucketed.
//
// Real seam, two decision types, no mocks beyond the two true boundaries (auth
// + db): triage seeds A and B into the SAME tier, then one pairwise compare
// (B beats A). Both decisions go through the REAL decisions route (route ->
// ScoringService -> PreferenceStateService -> preference rows), which we RE-READ
// from the DB.
//
// Mirrors sort-pipeline.integration.test.ts: describeDb / resetDb / seedBaseline,
// real repos across the seam, mocking only auth + db.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";

const { mockGetSession, UnauthorizedError } = vi.hoisted(() => {
  class UnauthorizedError extends Error {
    constructor(message = "Unauthorized") { super(message); this.name = "UnauthorizedError"; }
  }
  return { mockGetSession: vi.fn(), UnauthorizedError };
});
// Flat-replace form: the spread form pulls in uninstalled nodemailer and errors.
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

import { POST as recordDecision } from "@/app/api/sessions/[id]/decisions/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function decisionReq(body: unknown): Request {
  return new Request("http://localhost/api/sessions/x/decisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describeDb("pairwise is recorded as evidence through the real seam (route/service -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("a pairwise compare (B beats A) is durably counted on both preference rows without moving score", async () => {
    const { db } = getTestDb();
    const collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Pairwise ranking guard', 'active', now(), now())
    `);
    const itemRepo = new ItemRepository(db);
    const itemA = await itemRepo.create({ collectionId });
    const itemB = await itemRepo.create({ collectionId });
    const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Triage both into the SAME tier ("high") — same seed, so they are
    // co-bucketed; the pairwise below no longer separates them on score.
    for (const itemId of [itemA.id, itemB.id]) {
      const triageRes = await recordDecision(
        decisionReq({ type: "triage", decision: { itemId, result: "high" } }) as any,
        { params: { id: session.id } },
      );
      expect(triageRes.status).toBe(201);
    }

    // The pairwise compare: B beats A. It must NOT be dropped (purses-h02) — it
    // is recorded as evidence on both rows — but it does NOT move score anymore.
    const compareRes = await recordDecision(
      decisionReq({
        type: "pairwise_compare",
        decision: { itemAId: itemA.id, itemBId: itemB.id, result: "item_b" },
      }) as any,
      { params: { id: session.id } },
    );
    expect(compareRes.status).toBe(201);

    // RE-READ the real materialized preference rows (not a mock). New truth:
    // same-tier triage leaves A and B sharing the same score and bucket, and the
    // pairwise is counted as evidence on both (triage + compare => comparisonCount 2).
    // The eventual ORDER between them is decided by orderRank + finalize (Epic 0
    // Tasks 7/10), covered in binary-insertion-ranking.integration.test.ts.
    const prefRepo = new CollectionPreferenceItemRepository(db);
    const prefA = await prefRepo.findByItem(itemA.id, ownerId);
    const prefB = await prefRepo.findByItem(itemB.id, ownerId);
    expect(prefA).not.toBeNull();
    expect(prefB).not.toBeNull();

    // Co-bucketed and equal on score (pairwise no longer pulls the winner ahead).
    expect(prefA!.rankBucket).toBe("high");
    expect(prefB!.rankBucket).toBe("high");
    expect(prefA!.score).toBeCloseTo(prefB!.score, 6);

    // The compare was NOT dropped: both items counted the triage + the pairwise.
    expect(prefA!.comparisonCount).toBe(2);
    expect(prefB!.comparisonCount).toBe(2);
  });
});
