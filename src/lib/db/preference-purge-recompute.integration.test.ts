// purses-5g1g regression: a recompute must NEVER resurrect a purged item.
//
// ItemPurgeService hard-deletes an item + its preferences/dispositions/photos,
// but decision_events are append-only and SURVIVE the purge. A later recompute
// (PreferenceStateService.recalculatePreferences -> ScoringService
// .computePreferences) folds those surviving events; without the live-item
// filter it re-emits a preference row for the now-nonexistent item, which
// FK-violates preferences.item_id (no ON DELETE CASCADE) and rolls back the
// whole tap — so after purging one item, EVERY subsequent decision in that
// collection would 500.
//
// This exercises the REAL path un-mocked: the decisions route -> controller ->
// PreferenceStateService -> ScoringService -> repos -> ephemeral Postgres, with
// a real ItemPurgeService purge in the middle. Mocks ONLY the true boundaries:
// auth (to drive the curator), getDb, and @vercel/blob's `del`.
// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { ItemPurgeService } from "@/server/services/ItemPurgeService";

const { mockGetSession, mockBlobDel } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockBlobDel: vi.fn(),
}));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@vercel/blob", () => ({ del: mockBlobDel }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { POST as postDecision } from "@/app/api/sessions/[id]/decisions/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function decisionReq(sessionId: string, body: unknown): Request {
  return new Request(`http://localhost/api/sessions/${sessionId}/decisions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describeDb("recompute never resurrects a purged item (route -> service -> DB) — purses-5g1g", () => {
  let ownerId: string;

  async function prefRowCount(itemId: string): Promise<number> {
    const { db } = getTestDb();
    const rows = await db.execute(
      sql`SELECT count(*)::int AS n FROM preferences WHERE item_id = ${itemId}`,
    );
    return Number((rows as unknown as { n: number }[])[0].n);
  }

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    mockBlobDel.mockResolvedValue(undefined);
    ownerId = await seedBaseline();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("purging a triaged item leaves NO ghost preference row, does not FK-fail the next recompute, and keeps survivors' scores", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const itemRepo = new ItemRepository(db);
    const itemA = await itemRepo.create({ collectionId, name: "Doomed bag" });
    const itemB = await itemRepo.create({ collectionId, name: "Kept bag B" });
    const itemC = await itemRepo.create({ collectionId, name: "Kept bag C" });
    const sortSession = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Triage all three — each recompute plants a preference row (comparisonCount 1).
    for (const [item, result] of [
      [itemA, "top"],
      [itemB, "high"],
      [itemC, "medium"],
    ] as const) {
      const res = await postDecision(
        decisionReq(sortSession.id, {
          type: "triage",
          decision: { itemId: item.id, result },
          clientKey: `triage-${item.id}`,
        }) as any,
        { params: Promise.resolve({ id: sortSession.id }) } as any,
      );
      expect(res.status).toBe(201);
    }

    const prefRepo = new CollectionPreferenceItemRepository(db);
    const before = new Map(
      (await prefRepo.findByCollection(collectionId, ownerId)).map((p) => [p.itemId, p]),
    );
    // Non-vacuous: all three items got a preference row.
    expect(before.has(itemA.id)).toBe(true);
    expect(before.has(itemB.id)).toBe(true);
    expect(before.has(itemC.id)).toBe(true);

    // Hard-purge item A. Its preference row goes with it, but its triage
    // decision_event survives (append-only) — the resurrection hazard.
    await ItemPurgeService.fromDb(db).purge(itemA, ownerId);
    expect(await prefRowCount(itemA.id)).toBe(0);
    // Proof the hazard is live: A's decision_event is still in the log.
    const survivingEvents = await new DecisionEventRepository(db).findBySession(sortSession.id);
    expect(survivingEvents.some((e) => (e.decision as { itemId?: string }).itemId === itemA.id)).toBe(true);

    // Trigger a fresh recompute by recording another decision for a LIVE item.
    // Pre-fix this 500s on an FK violation (the recompute tries to re-insert A's
    // preference row); post-fix it succeeds and A is never resurrected.
    const res = await postDecision(
      decisionReq(sortSession.id, {
        type: "pairwise_compare",
        decision: { itemAId: itemB.id, itemBId: itemC.id, result: "item_a" },
        clientKey: "compare-bc",
      }) as any,
      { params: Promise.resolve({ id: sortSession.id }) } as any,
    );
    expect(res.status).toBe(201);

    // No ghost preference row for the purged item.
    expect(await prefRowCount(itemA.id)).toBe(0);

    // Survivors keep their triage scores (the purge changed nothing for them).
    const after = new Map(
      (await prefRepo.findByCollection(collectionId, ownerId)).map((p) => [p.itemId, p]),
    );
    expect(after.has(itemA.id)).toBe(false);
    expect(Number(after.get(itemB.id)!.score)).toBeCloseTo(Number(before.get(itemB.id)!.score));
    expect(Number(after.get(itemC.id)!.score)).toBeCloseTo(Number(before.get(itemC.id)!.score));
  });
});
