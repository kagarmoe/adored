// @vitest-environment node
// Save and share (spec §4.4), un-mocked: route -> RankingController ->
// SortResultService.saveAndShare -> repos -> Postgres. Mocks only auth + db.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { SortResultService } from "@/server/services/SortResultService";
import * as txMod from "@/lib/transactions";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { POST as save } from "@/app/api/collections/[id]/ranking/save/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const KEY = "01j00000000000000000000000";
const KEY_2 = "01j00000000000000000000001";

const saveReq = (body: unknown) =>
  new Request("http://localhost/api/collections/c/ranking/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as any;

describeDb("save and share (route -> service -> DB)", () => {
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

  /** b (Love, ordered first), a (Love, second), c (Onward) and an open session. */
  async function seedSorting() {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const items = new ItemRepository(db);
    const prefs = new CollectionPreferenceItemRepository(db);
    const a = (await items.create({ collectionId, name: "A" })).id;
    const b = (await items.create({ collectionId, name: "B" })).id;
    const c = (await items.create({ collectionId, name: "C" })).id;
    const base = { collectionId, curatorId: ownerId, score: 0.875, confidence: 1, comparisonCount: 1 };
    await prefs.create({ ...base, itemId: a, rankBucket: "top", orderRank: 1 });
    await prefs.create({ ...base, itemId: b, rankBucket: "top", orderRank: 0 });
    await prefs.create({ ...base, itemId: c, rankBucket: "low", score: 0.125 });
    const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    return { collectionId, a, b, c, sessionId: session.id };
  }
  const savedOrder = async (resultId: string) =>
    (await new SortResultItemRepository(getTestDb().db).findByResult(resultId))
      .sort((x, y) => x.computedRank - y.computedRank)
      .map((r) => r.itemId);

  it("saves the live order with pins: one finalized ranking, a share link, the sort closed", async () => {
    const { db } = getTestDb();
    const s = await seedSorting();
    await SortResultService.fromDb(db).pinItem(s.collectionId, ownerId, s.a, 1);

    const res = await save(saveReq({ name: "  Spring keepers  ", saveKey: KEY }), ctx(s.collectionId));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { resultNumber: number; shareToken: string };

    const saved = (await new SortResultRepository(db).findByCollection(s.collectionId)).filter((r) => r.status === "finalized");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: "Spring keepers", number: body.resultNumber });
    expect(await savedOrder(saved[0].id)).toEqual([s.a, s.b, s.c]);
    const shares = await new SortResultShareRepository(db).findByResult(saved[0].id);
    expect(shares.map((x) => [x.shareToken, x.status])).toEqual([[body.shareToken, "active"]]);
    expect((await new SessionRepository(db).findById(s.sessionId))!.status).toBe("completed");
  });

  // Regression (AR3): Save finalized the open draft, so every pin vanished from the live Ranking.
  it("pins survive a save: the hand-placed piece stays put, and only it is carried", async () => {
    const { db } = getTestDb();
    const s = await seedSorting();
    const service = SortResultService.fromDb(db);
    await service.pinItem(s.collectionId, ownerId, s.a, 1);

    expect((await save(saveReq({ name: "Kept", saveKey: KEY }), ctx(s.collectionId))).status).toBe(201);

    expect((await service.listPins(s.collectionId, ownerId)).map((p) => [p.itemId, p.position])).toEqual([[s.a, 1]]);
    const draft = await new SortResultRepository(db).findDraft(s.collectionId, ownerId);
    expect((await new SortResultItemRepository(db).findByResult(draft!.id)).map((r) => r.itemId)).toEqual([s.a]);
  });

  it("a save with no pins leaves no open draft behind", async () => {
    const { db } = getTestDb();
    const s = await seedSorting();
    expect((await save(saveReq({ name: "Plain", saveKey: KEY }), ctx(s.collectionId))).status).toBe(201);
    expect(await new SortResultRepository(db).findDraft(s.collectionId, ownerId)).toBeNull();
  });

  it("takes the save-key lock inside the save transaction", async () => {
    const s = await seedSorting();
    // Spy WITHOUT replacing the impl — the real lock still runs against pg.
    const lockSpy = vi.spyOn(txMod, "lockSaveKey");
    expect((await save(saveReq({ name: "Locked", saveKey: KEY }), ctx(s.collectionId))).status).toBe(201);
    expect(lockSpy).toHaveBeenCalledWith(expect.anything(), ownerId, KEY);
    lockSpy.mockRestore();
  });

  it("a retry with the same key returns the same link and creates nothing new", async () => {
    const { db } = getTestDb();
    const s = await seedSorting();
    const first = await (await save(saveReq({ name: "Once", saveKey: KEY }), ctx(s.collectionId))).json();
    const again = await save(saveReq({ name: "Once", saveKey: KEY }), ctx(s.collectionId));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(first);
    const results = await new SortResultRepository(db).findByCollection(s.collectionId);
    expect(results).toHaveLength(1);
    expect(await new SortResultShareRepository(db).findByResult(results[0].id)).toHaveLength(1);
  });

  it("a key already used in another collection is a 409", async () => {
    const s = await seedSorting();
    const other = await seedSorting();
    await save(saveReq({ name: "Here", saveKey: KEY }), ctx(s.collectionId));
    const res = await save(saveReq({ name: "There", saveKey: KEY }), ctx(other.collectionId));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("save_key_conflict");
    const { db } = getTestDb();
    expect(await new SortResultRepository(db).findByCollection(other.collectionId)).toEqual([]);
    expect((await new SessionRepository(db).findById(other.sessionId))!.status).toBe("active");
  });

  it("409s with nothing to save and writes nothing", async () => {
    const collectionId = await seedBareCollection(ownerId);
    const res = await save(saveReq({ name: "Empty", saveKey: KEY }), ctx(collectionId));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("nothing_to_save");
    expect(await new SortResultRepository(getTestDb().db).findByCollection(collectionId)).toEqual([]);
  });

  it("rolls everything back when the share cannot be written (atomic)", async () => {
    const { db } = getTestDb();
    const s = await seedSorting();
    const spy = vi.spyOn(SortResultShareRepository.prototype, "create").mockRejectedValueOnce(new Error("share store down"));
    const res = await save(saveReq({ name: "Doomed", saveKey: KEY }), ctx(s.collectionId));
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(await new SortResultRepository(db).findByCollection(s.collectionId)).toEqual([]);
    expect((await new SessionRepository(db).findById(s.sessionId))!.status).toBe("active");
  });

  it("a revision starts from the saved order, saves under its own link, and the old link keeps the old order", async () => {
    const { db } = getTestDb();
    const s = await seedSorting();
    const first = (await (await save(saveReq({ name: "First", saveKey: KEY }), ctx(s.collectionId))).json()) as { resultNumber: number; shareToken: string };
    const service = SortResultService.fromDb(db);
    const saved = await new SortResultRepository(db).findByCollectionAndNumber(s.collectionId, first.resultNumber);

    const revision = await service.supersedeResult(saved!.id);
    expect(revision!.status).toBe("draft");
    expect(new Map((await service.listPins(s.collectionId, ownerId)).map((p) => [p.itemId, p.position]))).toEqual(
      new Map([[s.b, 1], [s.a, 2]]),
    );

    await service.pinItem(s.collectionId, ownerId, s.a, 1);
    const second = (await (await save(saveReq({ name: "Second", saveKey: KEY_2 }), ctx(s.collectionId))).json()) as { resultNumber: number; shareToken: string };
    expect(second.shareToken).not.toBe(first.shareToken);

    const oldShare = await new SortResultShareRepository(db).findByToken(first.shareToken);
    expect(await savedOrder(oldShare!.sortResultId)).toEqual([s.b, s.a, s.c]);
    const newResult = await new SortResultRepository(db).findByCollectionAndNumber(s.collectionId, second.resultNumber);
    expect(await savedOrder(newResult!.id)).toEqual([s.a, s.b, s.c]);
  });
  // Regression: shares have no FK cascade, so a shared draft used to block the reap (500).
  it("a revision replaces a shared open draft, taking its share with it", async () => {
    const { db } = getTestDb();
    const s = await seedSorting();
    const first = (await (await save(saveReq({ name: "First", saveKey: KEY }), ctx(s.collectionId))).json()) as { resultNumber: number };
    const service = SortResultService.fromDb(db);
    await service.pinItem(s.collectionId, ownerId, s.a, 1);
    const draft = await new SortResultRepository(db).findDraft(s.collectionId, ownerId);
    await new SortResultShareRepository(db).create({ sortResultId: draft!.id, shareToken: "draft-share" });

    const saved = await new SortResultRepository(db).findByCollectionAndNumber(s.collectionId, first.resultNumber);
    const revision = await service.supersedeResult(saved!.id);

    expect(revision!.id).not.toBe(draft!.id);
    expect(await new SortResultRepository(db).findById(draft!.id)).toBeNull();
    expect(await new SortResultShareRepository(db).findByToken("draft-share")).toBeNull();
  });
});
