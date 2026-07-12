// purses-7x7m regression: purge must take the SAME (collection, curator)
// advisory lock the decision/disposition writers take, for EVERY curator who
// could recompute the collection.
//
// The recompute (PreferenceStateService.recalculatePreferences) is a
// check-then-act: it reads the collection's LIVE items, then bulk-upserts
// preference rows for them. Under READ COMMITTED a purge that commits between
// those two statements deletes an item the upsert is about to reference —
// preferences.item_id has no ON DELETE CASCADE, so the curator's tap dies on a
// 23503 (500 mid-decision). The writers serialize on
// lockCollectionCurator(tx, collectionId, curatorId); purge took no lock at all.
//
// An advisory lock only works if BOTH sides take it, in the same tx scope, on
// the same key — so this test holds the REAL writer lock (as an in-flight
// recompute would) on a separate connection and asserts the purge BLOCKS. A
// mocked lock would be a tautology; only a real Postgres lock proves this.
//
// The lock key is per-CURATOR but purge is collection-wide, so the case that
// matters (and that an actor-keyed lock would miss) is a COLLABORATOR
// recomputing while the OWNER purges — that is what both cases below exercise.
// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { closeDb, getTestDb, resetDb, TEST_DATABASE_URL } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { ItemPurgeService } from "@/server/services/ItemPurgeService";
import { CollectionPurgeService } from "@/server/services/CollectionPurgeService";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";

const { mockBlobDel, mockGetSession } = vi.hoisted(() => ({
  mockBlobDel: vi.fn(),
  mockGetSession: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ del: mockBlobDel }));
vi.mock("@/lib/photo-variants", () => ({
  deleteVariants: vi.fn().mockResolvedValue(undefined),
  variantPrefix: (id: string) => `variants/${id}/`,
}));
vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { POST as postRecalculate } from "@/app/api/collections/[id]/preferences/recalculate/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// The shared fixture client is max:1, and a blocked purge would occupy it — so
// the lock holder and the "is the row still there?" probe each need their own
// connection.
function extraClient() {
  return postgres(TEST_DATABASE_URL, { max: 1 });
}

describeDb("purge serializes against recompute on the writers' advisory lock — purses-7x7m", () => {
  let ownerId: string;
  let memberId: string;
  let collectionId: string;
  let holder: ReturnType<typeof postgres>;
  let probe: ReturnType<typeof postgres>;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    mockBlobDel.mockResolvedValue(undefined);
    ownerId = await seedBaseline();
    memberId = await seedUserRow("collaborator");
    collectionId = await seedBareCollection(ownerId);
    await new MembershipRepository(getTestDb().db).create({
      collectionId,
      userId: memberId,
      role: "curator",
    });
    holder = extraClient();
    probe = extraClient();
  });

  afterEach(async () => {
    await holder.end({ timeout: 5 });
    await probe.end({ timeout: 5 });
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await closeDb();
  });

  /** Hold the writer's real lock for the MEMBER curator, as an in-flight recompute does. */
  async function holdWriterLock(): Promise<void> {
    await holder.unsafe("BEGIN");
    await holder`select pg_advisory_xact_lock(hashtext(${collectionId}), hashtext(${memberId}))`;
  }

  async function itemCount(): Promise<number> {
    const rows = await probe<{ n: number }[]>`
      select count(*)::int as n from items where collection_id = ${collectionId}`;
    return rows[0].n;
  }

  it("ItemPurgeService.purge blocks while a curator's recompute holds the lock, then completes", async () => {
    const { db } = getTestDb();
    const item = await new ItemRepository(db).create({ collectionId, name: "Doomed bag" });

    await holdWriterLock();

    const purged = ItemPurgeService.fromDb(db)
      .purge(item, ownerId)
      .then(() => "done" as const);

    await new Promise((r) => setTimeout(r, 750));
    // Pre-fix the purge has already committed here and the item is gone.
    expect(await itemCount()).toBe(1);

    await holder.unsafe("COMMIT");
    await expect(purged).resolves.toBe("done");
    expect(await itemCount()).toBe(0);
  }, 20_000);

  it("CollectionPurgeService.purge blocks on the same lock, then completes", async () => {
    const { db } = getTestDb();
    await new ItemRepository(db).create({ collectionId, name: "Doomed bag" });
    const collection = await new CollectionRepository(db).findById(collectionId);

    await holdWriterLock();

    const purged = new CollectionPurgeService(db)
      .purge(collection!, ownerId)
      .then(() => "done" as const);

    await new Promise((r) => setTimeout(r, 750));
    expect(await itemCount()).toBe(1);

    await holder.unsafe("COMMIT");
    await expect(purged).resolves.toBe("done");
    expect(await itemCount()).toBe(0);
  }, 20_000);

  // The purge's lock only serializes parties that ALSO take it. The standalone
  // recompute route ran on the raw db — no transaction, no lock — so its
  // read-then-upsert still straddled a purge commit and could FK-500 (23503 on
  // preferences.item_id). Holding the (collection, curator) lock a purge takes
  // and asserting the route BLOCKS is the only real proof it now participates.
  it("POST /collections/[id]/preferences/recalculate blocks on the purge's lock", async () => {
    mockGetSession.mockResolvedValue({ user: { id: memberId } });
    await new ItemRepository(getTestDb().db).create({ collectionId, name: "Contested bag" });

    await holdWriterLock();

    let settled = false;
    const res = postRecalculate(
      new Request(`http://localhost/api/collections/${collectionId}/preferences/recalculate`, {
        method: "POST",
      }) as never,
      { params: Promise.resolve({ id: collectionId }) },
    ).then((r) => {
      settled = true;
      return r;
    });

    await new Promise((r) => setTimeout(r, 750));
    expect(settled).toBe(false);

    await holder.unsafe("COMMIT");
    expect((await res).status).toBe(200);
  }, 20_000);
});
