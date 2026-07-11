// Epic S PR S3a — the transactional bulk re-rank endpoint.
// PATCH /api/sort-results/[id]/items applies an ARRAY of {rid, manualRank} in ONE
// withTransaction (one drag = one atomic call); DELETE clears every item's manual
// overlay (back to the computed order). Drives the REAL handlers against ephemeral
// Postgres; mocks only auth + db. The load-bearing case is atomicity: a batch with
// one bad rid must roll the WHOLE batch back (no valid row's manualRank changed).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultService, ReorderFinalizedError } from "@/server/services/SortResultService";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
// Flat-replace BOTH exports the routes use, derived from one spy (spread form pulls in nodemailer).
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireAuth: async () => {
    const s = await mockGetSession();
    if (!s?.user) throw new Error("Unauthorized");
    return s.user;
  },
}));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { PATCH as reorderItems, DELETE as resetItems } from "@/app/api/sort-results/[id]/items/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

type SeededItem = { id: string };

/** A draft (or finalized) result under ownerId's collection with 3 ranked items (computedRank 1,2,3). */
async function seedResultWithItems(
  ownerId: string,
  curatorId: string,
  opts?: { status?: "draft" | "finalized" },
): Promise<{ collectionId: string; resultId: string; items: SeededItem[] }> {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  await db.execute(sql`
    INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
    VALUES (${collectionId}, ${ownerId}, 'Rerank', 'active', now(), now())
  `);
  const result = await new SortResultRepository(db).create({
    collectionId, curatorId, name: "R", status: opts?.status ?? "draft",
  });
  const itemRepo = new SortResultItemRepository(db);
  const items: SeededItem[] = [];
  for (let i = 0; i < 3; i++) {
    const item = await new ItemRepository(db).create({ collectionId }); // real FK parent
    const sri = await itemRepo.create({
      sortResultId: result.id, itemId: item.id, computedRank: i + 1, computedBucket: "medium",
    });
    items.push({ id: sri.id });
  }
  return { collectionId, resultId: result.id, items };
}

/** Add a distinct member (curator role, full sort access) to the collection. */
async function addMember(collectionId: string): Promise<string> {
  const { db } = getTestDb();
  const memberId = generateId("user");
  await db.insert((await import("@/lib/db/schema")).user).values({
    id: memberId, email: `m-${memberId}@adored.test`, name: "Member",
  });
  await new MembershipRepository(db).create({ collectionId, userId: memberId, role: "curator" });
  return memberId;
}

function patchReq(body: unknown) {
  return new Request("http://localhost/x", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
function deleteReq() {
  return new Request("http://localhost/x", { method: "DELETE" });
}

describeDb("bulk re-rank PATCH/DELETE /api/sort-results/[id]/items — Epic S S3a", () => {
  let ownerId: string;
  beforeEach(async () => { await resetDb(); ownerId = await seedBaseline(); });
  afterAll(async () => { await closeDb(); });

  it("403s a non-member (stranger) and leaves every manualRank NULL (IDOR)", async () => {
    const { db } = getTestDb();
    const { resultId, items } = await seedResultWithItems(ownerId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await reorderItems(
      patchReq({ order: [{ rid: items[0].id, manualRank: 99 }] }) as any,
      { params: { id: resultId } },
    );
    expect(res.status).toBe(403);
    expect((await new SortResultItemRepository(db).findById(items[0].id))!.manualRank).toBeNull();
  });

  it("403s a member who is not the result's curator (curator-scope)", async () => {
    const { collectionId, resultId, items } = await seedResultWithItems(ownerId, ownerId);
    const memberId = await addMember(collectionId);
    mockGetSession.mockResolvedValue({ user: { id: memberId } });
    const res = await reorderItems(
      patchReq({ order: [{ rid: items[0].id, manualRank: 99 }] }) as any,
      { params: { id: resultId } },
    );
    expect(res.status).toBe(403);
  });

  it("409s a FINALIZED result and writes nothing (re-rank is a draft activity)", async () => {
    const { db } = getTestDb();
    const { resultId, items } = await seedResultWithItems(ownerId, ownerId, { status: "finalized" });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await reorderItems(
      patchReq({ order: [{ rid: items[0].id, manualRank: 99 }] }) as any,
      { params: { id: resultId } },
    );
    expect(res.status).toBe(409);
    expect((await new SortResultItemRepository(db).findById(items[0].id))!.manualRank).toBeNull();
  });

  it("200s for the curator and persists the new manualRank per row", async () => {
    const { db } = getTestDb();
    const { resultId, items } = await seedResultWithItems(ownerId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    // Reverse the computed order by hand.
    const res = await reorderItems(
      patchReq({ order: [
        { rid: items[0].id, manualRank: 3 },
        { rid: items[1].id, manualRank: 2 },
        { rid: items[2].id, manualRank: 1 },
      ] }) as any,
      { params: { id: resultId } },
    );
    expect(res.status).toBe(200);
    const repo = new SortResultItemRepository(db);
    expect((await repo.findById(items[0].id))!.manualRank).toBe(3);
    expect((await repo.findById(items[1].id))!.manualRank).toBe(2);
    expect((await repo.findById(items[2].id))!.manualRank).toBe(1);
    // The endpoint returns the updated items so the client can render the new order.
    const body = (await res.json()) as Array<{ id: string; manualRank: number | null }>;
    const byId = new Map(body.map((r) => [r.id, r.manualRank]));
    expect(byId.get(items[2].id)).toBe(1);
  });

  it("ATOMICITY: one bad rid rolls the WHOLE batch back (no valid row changed) and 404s", async () => {
    const { db } = getTestDb();
    const { resultId, items } = await seedResultWithItems(ownerId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    // The bad rid sits LAST, AFTER two valid updates: if the write weren't
    // transactional those two would persist. The rollback is what we pin.
    const res = await reorderItems(
      patchReq({ order: [
        { rid: items[0].id, manualRank: 3 },
        { rid: items[1].id, manualRank: 2 },
        { rid: "sri_not_in_this_result", manualRank: 1 },
      ] }) as any,
      { params: { id: resultId } },
    );
    expect(res.status).toBe(404);
    const repo = new SortResultItemRepository(db);
    expect((await repo.findById(items[0].id))!.manualRank).toBeNull();
    expect((await repo.findById(items[1].id))!.manualRank).toBeNull();
    expect((await repo.findById(items[2].id))!.manualRank).toBeNull();
  });

  it("ATOMICITY: a rid from a DIFFERENT result rolls the batch back and 404s (cross-result IDOR)", async () => {
    const { db } = getTestDb();
    const { collectionId, resultId, items } = await seedResultWithItems(ownerId, ownerId);
    // A sibling result under the same collection with its own item.
    const other = await new SortResultRepository(db).create({
      collectionId, curatorId: ownerId, name: "Other", status: "draft",
    });
    const foreignSource = await new ItemRepository(db).create({ collectionId });
    const foreign = await new SortResultItemRepository(db).create({
      sortResultId: other.id, itemId: foreignSource.id, computedRank: 1, computedBucket: "top",
    });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await reorderItems(
      patchReq({ order: [
        { rid: items[0].id, manualRank: 3 },
        { rid: foreign.id, manualRank: 1 },
      ] }) as any,
      { params: { id: resultId } },
    );
    expect(res.status).toBe(404);
    const repo = new SortResultItemRepository(db);
    expect((await repo.findById(items[0].id))!.manualRank).toBeNull();
    // The foreign item was NOT touched either.
    expect((await repo.findById(foreign.id))!.manualRank).toBeNull();
  });

  it("400s a malformed batch (manualRank missing) and writes nothing", async () => {
    const { db } = getTestDb();
    const { resultId, items } = await seedResultWithItems(ownerId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await reorderItems(
      patchReq({ order: [{ rid: items[0].id }] }) as any,
      { params: { id: resultId } },
    );
    expect(res.status).toBe(400);
    expect((await new SortResultItemRepository(db).findById(items[0].id))!.manualRank).toBeNull();
  });

  // F-Data-M2: a batch that names the same rid twice is ambiguous — reject it at
  // the Zod boundary (400) rather than let the last write win non-deterministically.
  it("400s a batch with a DUPLICATE rid and writes nothing", async () => {
    const { db } = getTestDb();
    const { resultId, items } = await seedResultWithItems(ownerId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await reorderItems(
      patchReq({ order: [
        { rid: items[0].id, manualRank: 1 },
        { rid: items[0].id, manualRank: 2 },
      ] }) as any,
      { params: { id: resultId } },
    );
    expect(res.status).toBe(400);
    expect((await new SortResultItemRepository(db).findById(items[0].id))!.manualRank).toBeNull();
  });

  // F-Data-I1: the finalized-immutability guard lives INSIDE the write transaction
  // (a FOR UPDATE row lock + status re-check), not only in the route's pre-tx gate.
  // Calling the service directly on a finalized result (bypassing the route gate,
  // the way a TOCTOU race would) still rejects and writes nothing.
  it("in-tx guard: reorderResultItems on a FINALIZED result throws and writes nothing", async () => {
    const { db } = getTestDb();
    const { resultId, items } = await seedResultWithItems(ownerId, ownerId);
    // Finalize AFTER seeding a draft — the route would 409 pre-tx, but here we
    // hit the service directly to prove the guard is in the transaction.
    await new SortResultRepository(db).update(resultId, { status: "finalized" });
    await expect(
      SortResultService.fromDb(db).reorderResultItems(resultId, [
        { rid: items[0].id, manualRank: 1 },
      ]),
    ).rejects.toBeInstanceOf(ReorderFinalizedError);
    expect((await new SortResultItemRepository(db).findById(items[0].id))!.manualRank).toBeNull();
  });

  it("in-tx guard: resetManualOverridesForResult on a FINALIZED result throws and leaves overrides intact", async () => {
    const { db } = getTestDb();
    const { resultId, items } = await seedResultWithItems(ownerId, ownerId);
    const repo = new SortResultItemRepository(db);
    await repo.update(items[0].id, { manualRank: 99, manualBucket: "top" });
    await new SortResultRepository(db).update(resultId, { status: "finalized" });
    await expect(
      SortResultService.fromDb(db).resetManualOverridesForResult(resultId),
    ).rejects.toBeInstanceOf(ReorderFinalizedError);
    expect((await repo.findById(items[0].id))!.manualRank).toBe(99);
  });

  it("DELETE clears manualRank/manualBucket for every item (back to the computed order)", async () => {
    const { db } = getTestDb();
    const { resultId, items } = await seedResultWithItems(ownerId, ownerId);
    const repo = new SortResultItemRepository(db);
    for (const it of items) await repo.update(it.id, { manualRank: 99, manualBucket: "top" });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await resetItems(deleteReq() as any, { params: { id: resultId } });
    expect(res.status).toBe(200);
    for (const it of items) {
      const after = await repo.findById(it.id);
      expect(after!.manualRank).toBeNull();
      expect(after!.manualBucket).toBeNull();
    }
  });

  it("DELETE 403s a non-member and leaves the overrides intact (IDOR)", async () => {
    const { db } = getTestDb();
    const { resultId, items } = await seedResultWithItems(ownerId, ownerId);
    const repo = new SortResultItemRepository(db);
    await repo.update(items[0].id, { manualRank: 99, manualBucket: "top" });
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await resetItems(deleteReq() as any, { params: { id: resultId } });
    expect(res.status).toBe(403);
    expect((await repo.findById(items[0].id))!.manualRank).toBe(99);
  });

  it("DELETE 409s a FINALIZED result (reset is a draft activity)", async () => {
    const { resultId } = await seedResultWithItems(ownerId, ownerId, { status: "finalized" });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await resetItems(deleteReq() as any, { params: { id: resultId } });
    expect(res.status).toBe(409);
  });
});
