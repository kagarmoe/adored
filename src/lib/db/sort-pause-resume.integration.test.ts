// @vitest-environment node
// Spec §7 "Pause keeps progress; Keep sorting resumes paused" — the real session
// PATCH route over Postgres, then the same phase chooser the Sort screen runs.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { DecisionController } from "@/server/api/decisions";
import { chooseSortPhase } from "@/lib/sort-phase";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { PATCH as patchSession } from "@/app/api/sessions/[id]/route";
import { POST as postDecision } from "@/app/api/sessions/[id]/decisions/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const json = (body: unknown) =>
  new Request("http://localhost/api/sessions/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const patch = (body: unknown) =>
  new Request("http://localhost/api/sessions/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describeDb("pause keeps progress; Keep sorting resumes the paused sort", () => {
  let ownerId: string;
  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
  });
  afterAll(async () => {
    await closeDb();
  });

  it("an answer given before Pause is still there after Keep sorting, and the sort picks up after it", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const items = new ItemRepository(db);
    const first = await items.create({ collectionId, name: "First" });
    await items.create({ collectionId, name: "Second" });
    const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    const params = { params: Promise.resolve({ id: session.id }) } as any;

    expect((await postDecision(json({ type: "triage", decision: { itemId: first.id, result: "top" } }) as any, params)).status).toBe(201);
    expect((await patchSession(patch({ status: "paused" }) as any, params)).status).toBe(200);
    expect((await new SessionRepository(db).findById(session.id))!.status).toBe("paused");
    expect((await patchSession(patch({ status: "active" }) as any, params)).status).toBe(200);
    expect((await new SessionRepository(db).findById(session.id))!.status).toBe("active");

    const phase = chooseSortPhase({
      items: await items.findByCollection(collectionId),
      preferences: await new CollectionPreferenceItemRepository(db).findByCollection(collectionId, ownerId),
      dispositionByItemId: new Map(),
      curatorDecisions: await DecisionController.fromDb(db).listForCurator(collectionId, ownerId),
      deferredOffered: false,
    });
    expect(phase.kind === "feelings" && phase.queue.map((e) => e.item.name)).toEqual(["Second"]);
    expect(phase.progress).toEqual({ done: 1, total: 2 });
  });
});
