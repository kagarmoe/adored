// @vitest-environment node
// The live ranking's hand placement (spec §4 "Adjusting"), un-mocked: route ->
// RankingController -> SortResultService -> repos -> Postgres. Mocks only auth + db.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import type { RankBucket } from "@/types";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { PUT as pin, DELETE as unpin } from "@/app/api/collections/[id]/ranking/pins/[itemId]/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function req(method: "PUT" | "DELETE", body?: unknown): Request {
  return new Request("http://localhost/api/collections/c/ranking/pins/i", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id: string, itemId: string) => ({ params: Promise.resolve({ id, itemId }) }) as any;

describeDb("ranking pins (route -> service -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
  });
  afterAll(async () => {
    await closeDb();
  });

  async function seedRanked(buckets: RankBucket[]) {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const prefs = new CollectionPreferenceItemRepository(db);
    const itemIds: string[] = [];
    for (const [i, rankBucket] of buckets.entries()) {
      const item = await new ItemRepository(db).create({ collectionId, name: `Piece ${i + 1}` });
      await prefs.create({ collectionId, curatorId: ownerId, itemId: item.id, score: 0.5, confidence: 1, rankBucket, comparisonCount: 1 });
      itemIds.push(item.id);
    }
    return { collectionId, itemIds };
  }
  const drafts = async (collectionId: string) =>
    (await new SortResultRepository(getTestDb().db).findByCollection(collectionId)).filter((r) => r.status === "draft");
  const pinsOf = async (resultId: string) =>
    new Map((await new SortResultItemRepository(getTestDb().db).findByResult(resultId)).map((r) => [r.itemId, r.manualRank]));

  it("the first move opens the one draft; the next move reuses it", async () => {
    const { collectionId, itemIds } = await seedRanked(["top", "high", "medium"]);
    expect(await drafts(collectionId)).toHaveLength(0);

    expect((await pin(req("PUT", { position: 1 }), ctx(collectionId, itemIds[2]))).status).toBe(200);
    expect((await pin(req("PUT", { position: 3 }), ctx(collectionId, itemIds[0]))).status).toBe(200);

    const open = await drafts(collectionId);
    expect(open).toHaveLength(1);
    expect(open[0].name).toBe("Still deciding");
    expect(await pinsOf(open[0].id)).toEqual(new Map([[itemIds[2], 0], [itemIds[0], 2]])); // manualRank is 0-based
  });

  // Regression (AR1): with every piece pinned, a move down used to wrap the displaced
  // piece into the gap above instead of shifting the pieces it passed.
  it("a move in a fully pinned list shifts the pieces it passes, as the list showed", async () => {
    const { collectionId, itemIds } = await seedRanked(["top", "high", "medium"]);
    for (const [i, itemId] of itemIds.entries()) await pin(req("PUT", { position: i + 1 }), ctx(collectionId, itemId));

    expect((await pin(req("PUT", { position: 2 }), ctx(collectionId, itemIds[0]))).status).toBe(200);

    const [open] = await drafts(collectionId);
    expect(await pinsOf(open.id)).toEqual(new Map([[itemIds[1], 0], [itemIds[0], 1], [itemIds[2], 2]]));
  });

  it("unpin clears the placement and keeps the draft (idempotent)", async () => {
    const { collectionId, itemIds } = await seedRanked(["top", "high"]);
    await pin(req("PUT", { position: 1 }), ctx(collectionId, itemIds[1]));
    expect((await unpin(req("DELETE"), ctx(collectionId, itemIds[1]))).status).toBe(200);
    expect((await unpin(req("DELETE"), ctx(collectionId, itemIds[1]))).status).toBe(200);
    const [open] = await drafts(collectionId);
    expect(await pinsOf(open.id)).toEqual(new Map([[itemIds[1], null]]));
  });

  it("404s a piece from another collection and opens nothing", async () => {
    const { collectionId } = await seedRanked(["top"]);
    const other = await seedRanked(["top"]);
    expect((await pin(req("PUT", { position: 1 }), ctx(collectionId, other.itemIds[0]))).status).toBe(404);
    expect(await drafts(collectionId)).toHaveLength(0);
  });
});
