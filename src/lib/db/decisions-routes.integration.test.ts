// Real-DB integration proof for the decisions route's disposition side effect:
//   POST /api/sessions/[id]/decisions
//
// Epic C PR1, Task 7 (disposed <=> untriaged invariant):
//   Triaging an item must CLEAR any prior disposition for that curator. A
//   previously deferred/set_aside item, once triaged, can no longer be both
//   disposed AND triaged — the route deletes the disposition row after the
//   triage decision is recorded.
//
// Un-mocked: route -> DecisionController/PreferenceController + repos -> pg.
// Mocks ONLY the two true boundaries: auth (to drive the curator) and getDb.
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
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

describeDb("decisions route — clear-disposition-on-triage (route -> repo -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("triaging a deferred item → 201 and clears that item's disposition (present before, gone after)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Deferred bag" });
    const sortSession = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });

    // The curator deferred this item earlier.
    const dispRepo = new ItemDispositionRepository(db);
    await dispRepo.upsert({ collectionId, curatorId: ownerId, itemId: item.id, disposition: "deferred" });
    // Present before: a real disposition row exists (non-vacuous guard).
    expect(await dispRepo.findByItem(item.id, ownerId)).not.toBeNull();

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await postDecision(
      decisionReq(sortSession.id, { type: "triage", decision: { itemId: item.id, result: "top" } }) as any,
      { params: Promise.resolve({ id: sortSession.id }) } as any,
    );
    expect(res.status).toBe(201);

    // Gone after: triage cleared the disposition (disposed <=> untriaged).
    expect(await dispRepo.findByItem(item.id, ownerId)).toBeNull();
  });

  it("a non-triage decision (pairwise_compare) → 201 and does NOT touch dispositions", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const itemA = await new ItemRepository(db).create({ collectionId, name: "Bag A" });
    const itemB = await new ItemRepository(db).create({ collectionId, name: "Bag B" });
    const sortSession = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });

    // A third item is deferred; a pairwise decision on A vs B must leave it alone.
    const itemC = await new ItemRepository(db).create({ collectionId, name: "Bag C" });
    const dispRepo = new ItemDispositionRepository(db);
    await dispRepo.upsert({ collectionId, curatorId: ownerId, itemId: itemC.id, disposition: "set_aside" });
    expect(await dispRepo.findByItem(itemC.id, ownerId)).not.toBeNull();

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await postDecision(
      decisionReq(sortSession.id, {
        type: "pairwise_compare",
        decision: { itemAId: itemA.id, itemBId: itemB.id, result: "item_a" },
      }) as any,
      { params: Promise.resolve({ id: sortSession.id }) } as any,
    );
    expect(res.status).toBe(201);

    // The unrelated deferred item is untouched — only triage clears dispositions.
    expect(await dispRepo.findByItem(itemC.id, ownerId)).not.toBeNull();
  });

  it("clear-on-triage is ATOMIC: a disposition-clear failure rolls back the event AND the preference (item stays disposed, never both ranked and disposed)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Deferred bag" });
    const sortSession = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });

    const dispRepo = new ItemDispositionRepository(db);
    await dispRepo.upsert({ collectionId, curatorId: ownerId, itemId: item.id, disposition: "deferred" });
    expect(await dispRepo.findByItem(item.id, ownerId)).not.toBeNull();

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    // Force the final write in the tx (the disposition clear) to fail AFTER the
    // event insert + preference recalc have run. Without a transaction this would
    // leave the item both ranked (preference) and disposed — the bug under test.
    const spy = vi
      .spyOn(ItemDispositionRepository.prototype, "delete")
      .mockRejectedValueOnce(new Error("simulated clear failure"));
    try {
      const res = await postDecision(
        decisionReq(sortSession.id, { type: "triage", decision: { itemId: item.id, result: "top" } }) as any,
        { params: Promise.resolve({ id: sortSession.id }) } as any,
      );
      // The route maps the thrown error to a 500.
      expect(res.status).toBe(500);
    } finally {
      spy.mockRestore();
    }

    // Transaction rolled back: NO event row and NO preference row persisted.
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(0);
    expect(await new CollectionPreferenceItemRepository(db).findByCollection(collectionId, ownerId)).toHaveLength(0);
    // And the disposition the curator set earlier is still there — the item is
    // disposed XOR triaged, never both (disposed <=> untriaged invariant holds).
    expect(await dispRepo.findByItem(item.id, ownerId)).not.toBeNull();
  });
});
