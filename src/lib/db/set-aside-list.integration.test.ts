// Un-mocked DB-integration proof for the "Set aside" list page's DATA PATH
// (Epic C PR2, Task 2). The page composes three real fetches against pg:
//   1. DispositionController.listDispositions(collectionId, curatorId, "set_aside")
//      → ONLY the curator's set-aside items (not deferred, not another curator's),
//   2. ItemController.listItems(collectionId) filtered to those itemIds
//      → the item details the rows render,
//   3. PhotoController.findCoverPhotosByItemIds([...itemIds])
//      → the cover image per row.
//
// This pins the seam that matters: curator-scoped, disposition-filtered selection
// against the REAL repos → ephemeral Postgres. Mocks ONLY the two true boundaries:
// getDb (-> test db) and auth (-> curator). Item B (no disposition) must be absent;
// a SECOND curator must see none of curator-1's set-aside items.
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { ItemController } from "@/server/api/items";
import { DispositionController } from "@/server/api/dispositions";
import { PhotoController } from "@/server/api/photos";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("set-aside list page data path (Epic C PR2 Task 2)", () => {
  let curatorId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    curatorId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("lists ONLY the curator's set-aside item A with its cover — not deferred B, not another curator's", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(curatorId);
    const itemA = await new ItemRepository(db).create({ collectionId, name: "Bag A" });
    const itemB = await new ItemRepository(db).create({ collectionId, name: "Bag B" });

    // A cover photo for A so the row's image path is exercised.
    await new PhotoRepository(db).create({
      itemId: itemA.id,
      collectionId,
      blobKey: "set-aside-a-hero",
      filename: "a.jpg",
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: curatorId,
      isHero: true,
    });

    // Curator sets A aside; B is deferred (a DIFFERENT disposition) — B must not
    // appear in the set_aside list even though it has a disposition row.
    const dispRepo = new ItemDispositionRepository(db);
    await dispRepo.upsert({ collectionId, curatorId, itemId: itemA.id, disposition: "set_aside" });
    await dispRepo.upsert({ collectionId, curatorId, itemId: itemB.id, disposition: "deferred" });

    // ---- The EXACT data path the page composes ----
    const dispositions = await DispositionController.fromDb(db).listDispositions(
      collectionId,
      curatorId,
      "set_aside",
    );
    const setAsideItemIds = new Set(dispositions.map((d) => d.itemId));

    // Curator-scoped, disposition-filtered: only A.
    expect(setAsideItemIds.has(itemA.id)).toBe(true);
    expect(setAsideItemIds.has(itemB.id)).toBe(false);
    expect(setAsideItemIds.size).toBe(1);

    // The item details the rows render: A present, B absent.
    const items = await ItemController.fromDb(db).listItems(collectionId);
    const listed = items.filter((i) => setAsideItemIds.has(i.id));
    expect(listed.map((i) => i.id)).toEqual([itemA.id]);
    expect(listed[0].name).toBe("Bag A");

    // The cover image per row resolves for A.
    const covers = await PhotoController.fromDb(db).findCoverPhotosByItemIds([...setAsideItemIds]);
    expect(covers.get(itemA.id)).toBeDefined();
    expect(covers.get(itemA.id)!.blobKey).toBe("set-aside-a-hero");
  });

  it("a SECOND curator sees none of the first curator's set-aside items (curator-scoped)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(curatorId);
    const itemA = await new ItemRepository(db).create({ collectionId, name: "Bag A" });

    await new ItemDispositionRepository(db).upsert({
      collectionId,
      curatorId,
      itemId: itemA.id,
      disposition: "set_aside",
    });

    const otherCuratorId = await seedUserRow("set-aside-other-curator");
    const theirSetAside = await DispositionController.fromDb(db).listDispositions(
      collectionId,
      otherCuratorId,
      "set_aside",
    );

    // Non-vacuous: curator-1 DOES see A (proves the seed worked); curator-2 sees none.
    const curator1SetAside = await DispositionController.fromDb(db).listDispositions(
      collectionId,
      curatorId,
      "set_aside",
    );
    expect(curator1SetAside.map((d) => d.itemId)).toEqual([itemA.id]);
    expect(theirSetAside).toHaveLength(0);
  });
});
