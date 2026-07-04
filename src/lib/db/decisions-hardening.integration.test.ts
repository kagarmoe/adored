// Real-DB integration proof for the hardened decisions/dispositions write path:
//   POST /api/sessions/[id]/decisions          (sxfo boundary validation + duv4 gate/lock)
//   POST /api/collections/[id]/dispositions     (duv4 re-check under the shared lock)
//
// sxfo (boundary validation): malformed JSON and an out-of-contract body are 400
//   (API.md's contract), rejected BEFORE the transaction — never a 500, never a
//   persisted junk decision_events row.
// duv4 (concurrency + status gate): a decision is refused on a terminal session
//   (409); BOTH write paths take the SAME (collection,curator) advisory lock inside
//   their transaction, and setDisposition re-checks the preference under that lock.
//
// A full concurrent DB race test is NOT feasible here: the test pool is postgres-js
// with { max: 1 } (a single connection), so two transactions cannot be open at once
// to actually contend on the advisory lock. The guard is therefore: the lock is
// PROVEN TAKEN in both paths (spy on lockCollectionCurator), the re-check still
// throws under the lock, and the status gate rejects terminal sessions.
//
// Mocks ONLY the two true boundaries: auth (to drive the curator) and getDb.
// Un-mocked: route -> controller/repo -> pg.
// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { sessionsTable } from "@/lib/db/schema";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import * as txMod from "@/lib/transactions";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { POST as postDecision } from "@/app/api/sessions/[id]/decisions/route";
import { POST as postDisposition } from "@/app/api/collections/[id]/dispositions/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function decisionReq(sessionId: string, body: unknown): Request {
  return new Request(`http://localhost/api/sessions/${sessionId}/decisions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function dispositionReq(collectionId: string, body: unknown): Request {
  return new Request(`http://localhost/api/collections/${collectionId}/dispositions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describeDb("decisions/dispositions hardening (route -> controller -> repo -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await closeDb();
  });

  // ── sxfo: boundary validation ──────────────────────────────────────────────

  it("sxfo: malformed JSON body → 400, and NO decision_events row is persisted", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const sortSession = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await postDecision(
      decisionReq(sortSession.id, "{ not valid json ]") as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(400);
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(0);
  });

  it("sxfo: an out-of-enum `type` ('garbage') → 400 (not 500) and NO row persisted", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Bag" });
    const sortSession = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await postDecision(
      decisionReq(sortSession.id, { type: "garbage", decision: { itemId: item.id } }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(400);
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(0);
  });

  it("sxfo: a valid `type` but an out-of-shape decision (bad triage result) → 400 and NO row", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Bag" });
    const sortSession = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await postDecision(
      decisionReq(sortSession.id, { type: "triage", decision: { itemId: item.id, result: "nope" } }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(400);
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(0);
  });

  it("sxfo: a valid triage decision on an active session → 201 and the event persists", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Bag" });
    const sortSession = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await postDecision(
      decisionReq(sortSession.id, { type: "triage", decision: { itemId: item.id, result: "top" } }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(201);
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(1);
  });

  // ── duv4: status gate ──────────────────────────────────────────────────────

  it("duv4: a decision on a COMPLETED (terminal) session → 409 and NO row persisted", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Bag" });
    const sortSession = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    // Move the session to a terminal state — it still resolves (deletedAt IS NULL),
    // so the route reaches the status gate rather than 404-ing.
    await db.update(sessionsTable).set({ status: "completed" }).where(eq(sessionsTable.id, sortSession.id));
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await postDecision(
      decisionReq(sortSession.id, { type: "triage", decision: { itemId: item.id, result: "top" } }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(409);
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(0);
  });

  // ── duv4: the shared advisory lock is TAKEN in the decisions path ───────────

  it("duv4: the decisions path takes the (collection,curator) advisory lock inside its tx", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Bag" });
    const sortSession = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Spy WITHOUT replacing the impl — the real lock still runs against pg; we only
    // assert it was invoked with the (tx, collectionId, curatorId) key.
    const lockSpy = vi.spyOn(txMod, "lockCollectionCurator");

    const res = await postDecision(
      decisionReq(sortSession.id, { type: "triage", decision: { itemId: item.id, result: "top" } }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(201);
    expect(lockSpy).toHaveBeenCalledWith(expect.anything(), collectionId, ownerId);
  });

  // ── duv4: setDisposition re-checks the preference UNDER the shared lock ──────

  it("duv4: setDisposition still throws PreferenceExistsError (409) when a preference exists — re-checked under the lock", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Triaged bag" });
    // A preference exists → the disposed <=> untriaged guard must refuse a disposition.
    await new CollectionPreferenceItemRepository(db).create({
      collectionId,
      curatorId: ownerId,
      itemId: item.id,
      score: 0.5,
      confidence: 0.5,
      rankBucket: "medium",
      comparisonCount: 0,
    });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await postDisposition(
      dispositionReq(collectionId, { itemId: item.id, disposition: "set_aside" }) as any,
      { params: { id: collectionId } } as any,
    );
    expect(res.status).toBe(409);
    // No disposition row written — the item is disposed XOR triaged, never both.
    expect(await new ItemDispositionRepository(db).findByItem(item.id, ownerId)).toBeNull();
  });

  it("duv4: the setDisposition path takes the SAME (collection,curator) advisory lock inside its tx", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Bag" });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const lockSpy = vi.spyOn(txMod, "lockCollectionCurator");

    const res = await postDisposition(
      dispositionReq(collectionId, { itemId: item.id, disposition: "deferred" }) as any,
      { params: { id: collectionId } } as any,
    );
    expect(res.status).toBe(201);
    expect(lockSpy).toHaveBeenCalledWith(expect.anything(), collectionId, ownerId);
    // And the row was persisted under the lock.
    expect(await new ItemDispositionRepository(db).findByItem(item.id, ownerId)).not.toBeNull();
  });
});
