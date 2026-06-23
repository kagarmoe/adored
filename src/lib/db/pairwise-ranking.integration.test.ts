// src/lib/db/pairwise-ranking.integration.test.ts
//
// Regression guard (spec §6.4 / purses-o93, guarding purses-h02): a pairwise
// choice must actually change the MATERIALIZED ranking order. purses-h02 fixed
// the bug where pairwise results were discarded; this test pins that fix so a
// regression — pairwise dropped on the floor again — fails CI.
//
// Real seam, two decision types, no mocks beyond the two true boundaries (auth
// + db): triage seeds A and B into the SAME tier (so triage alone leaves them
// tied), then a single decisive pairwise compare where B beats A. Both decisions
// go through the REAL decisions route (route -> ScoringService ->
// PreferenceStateService -> preference rows). The live POST /api/sort-results
// then materializes sort_result_items, which we RE-READ from the DB and assert
// B outranks A. computedRank is 0-based (0 = best).
//
// Why one pairwise win is "strong enough": triage seeds both at the "high" tier
// center 0.625 (ScoringService.TIER_SEED.high). One "B beats A" applies +0.1 to
// the winner and -0.05 to the loser, so B -> 0.725 and A -> 0.575: a 0.15 gap
// that unambiguously orders B above A within the tier. No boundary crossing is
// needed to prove pairwise drove the order.
//
// Mirrors sort-pipeline.integration.test.ts: describeDb / resetDb / seedBaseline,
// real repos across the seam, mocking only auth + db.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";

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
import { POST as createResult } from "@/app/api/sort-results/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function decisionReq(body: unknown): Request {
  return new Request("http://localhost/api/sessions/x/decisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describeDb("pairwise drives the materialized ranking (route/service -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("a pairwise choice (B beats A) places B before A in the materialized result", async () => {
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

    // Triage both into the SAME tier ("high") — tied on triage alone, so any
    // order difference downstream can only have come from the pairwise compare.
    for (const itemId of [itemA.id, itemB.id]) {
      const triageRes = await recordDecision(
        decisionReq({ type: "triage", decision: { itemId, result: "high" } }) as any,
        { params: { id: session.id } },
      );
      expect(triageRes.status).toBe(201);
    }

    // The decisive pairwise compare: B beats A.
    const compareRes = await recordDecision(
      decisionReq({
        type: "pairwise_compare",
        decision: { itemAId: itemA.id, itemBId: itemB.id, result: "item_b" },
      }) as any,
      { params: { id: session.id } },
    );
    expect(compareRes.status).toBe(201);

    // Materialize through the live POST /api/sort-results route (the purses-h02
    // seam — preferences -> sort_result_items).
    const res = await createResult(
      new Request("http://localhost/api/sort-results", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collectionId, name: "Pairwise ranking guard" }),
      }) as any,
    );
    expect(res.status).toBe(201);
    const resultId = (await res.json()).id as string;

    // RE-READ the real materialized rows (not the route's response body, not a
    // mock) and assert pairwise drove the order: B (the winner) before A.
    const items = await new SortResultItemRepository(db).findByResult(resultId);
    expect(items).toHaveLength(2);
    const winnerB = items.find((i) => i.itemId === itemB.id)!;
    const loserA = items.find((i) => i.itemId === itemA.id)!;
    expect(winnerB).toBeDefined();
    expect(loserA).toBeDefined();

    // Lower computedRank = better; B beat A, so B ranks ahead of A.
    expect(winnerB.computedRank).toBeLessThan(loserA.computedRank);
  });
});
