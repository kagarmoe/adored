// @vitest-environment node
// Honest real-DB integration for the four pool routes:
//   GET    /api/collections/[id]/pool/photos                       (list pooled)
//   POST   /api/collections/[id]/pool/group                        (pool -> new item)
//   POST   /api/collections/[id]/photos/reassign                   (move photos)
//   GET    /api/collections/[id]/pool/photos/[photoId]/file        (serve pooled)
// Real handler -> ItemService -> repos -> ephemeral Postgres. A "pool photo" is a
// row with itemId === null. The mutating routes (group / reassign) touch ONLY
// repos — never blob — so no blob mock is needed for them; only `/file` (via
// servePhotoFile) reaches @vercel/blob `get`, which we mock so the store isn't
// hit. `pool/upload` (token-gen, no DB write) is kept as a trimmed plain unit test
// next to its route — NOT here.
//
// AUTHZ as-implemented (route.ts, post-pv9 PR4): every pool route is capability-gated
// via requireApiCapability — group/reassign require photos:write, the two reads require
// items:read (both curator-level; the canAddPhotos flag is inert under the full-curator
// model). 404 (collection / photo absent) resolves BEFORE the 403 non-member check.
//
// Every "absent/0/gone" assertion is paired with a "present/non-zero before" read
// via a repo, so a never-seeded row can't make the suite pass vacuously.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedFullCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import type { Photo } from "@/types";

const { mockGetSession, mockBlobGet } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockBlobGet: vi.fn(),
}));
// Flat-replace BOTH @/lib/auth exports from one spy (spread/importActual pulls nodemailer).
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireAuth: async () => {
    const s = await mockGetSession();
    if (!s?.user) throw new Error("Unauthorized");
    return s.user;
  },
}));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));
// `/file` -> servePhotoFile -> @vercel/blob `get`. The other three routes never
// touch blob. `put` is stubbed only so servePhotoFile's variant-persist path (not
// exercised by these orig-passthrough cases) can't reach the real store either.
vi.mock("@vercel/blob", () => ({ get: mockBlobGet, put: vi.fn() }));

import { GET as listPool } from "@/app/api/collections/[id]/pool/photos/route";
import { POST as groupPool } from "@/app/api/collections/[id]/pool/group/route";
import { POST as reassign } from "@/app/api/collections/[id]/photos/reassign/route";
import { GET as servePool } from "@/app/api/collections/[id]/pool/photos/[photoId]/file/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** JSON request the POST handlers read via req.json(). A raw string body lets a
 *  test feed malformed JSON. */
function jsonReq(body?: unknown): Request {
  return new Request("http://localhost/api/pool", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const colCtx = (id: string) => ({ params: Promise.resolve({ id }) }) as any;
const photoCtx = (id: string, photoId: string) => ({ params: Promise.resolve({ id, photoId }) }) as any;

describeDb("pool routes (route -> repo -> DB)", () => {
  let ownerId: string;
  let photoRepo: PhotoRepository;
  let itemRepo: ItemRepository;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
    const { db } = getTestDb();
    photoRepo = new PhotoRepository(db);
    itemRepo = new ItemRepository(db);
  });

  afterAll(async () => {
    await closeDb();
  });

  /** Create a pooled (itemId === null) photo in the collection. */
  function poolPhoto(collectionId: string, filename: string, blobKey = "store/" + filename): Promise<Photo> {
    return photoRepo.create({
      itemId: null,
      collectionId,
      blobKey,
      filename,
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: ownerId,
      isHero: false,
    });
  }

  // ===================== GET pool/photos =================================
  describe("GET pool/photos", () => {
    it("401s an unauthenticated caller", async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue(null);

      const res = await listPool(jsonReq() as any, colCtx(collectionId));
      expect(res.status).toBe(401);
    });

    it("404s when the collection does not exist (no information leak)", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await listPool(jsonReq() as any, colCtx("col-absent"));
      expect(res.status).toBe(404);
    });

    it("returns ONLY pooled (itemId === null) photos for the owner — assigned excluded", async () => {
      // seedFullCollection already has TWO assigned photos (itemA active, itemB
      // soft-deleted). Add one pooled photo: only the pooled one may return.
      const { collectionId } = await seedFullCollection(ownerId);
      const pooled = await poolPhoto(collectionId, "pooled.jpg");
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // present before: there IS an assigned photo, so an "only pooled" assertion isn't vacuous.
      const assignedCount = (await photoRepo.findCoverPhotosByCollectionIds([collectionId])).size;
      expect(assignedCount).toBeGreaterThan(0);

      const res = await listPool(jsonReq() as any, colCtx(collectionId));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { photos: { id: string; filename: string }[] };
      expect(body.photos).toEqual([{ id: pooled.id, filename: "pooled.jpg" }]);
    });

    it("200s for a member who is not the owner (member-or-owner read tier)", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      await poolPhoto(collectionId, "pooled.jpg");
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await listPool(jsonReq() as any, colCtx(collectionId));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { photos: unknown[] };
      expect(body.photos).toHaveLength(1);
    });
  });

  // ===================== POST pool/group =================================
  describe("POST pool/group", () => {
    it("401s an unauthenticated caller — no item created", async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      const p = await poolPhoto(collectionId, "g.jpg");
      mockGetSession.mockResolvedValue(null);

      const before = (await itemRepo.findByCollection(collectionId)).length;
      const res = await groupPool(jsonReq({ photoIds: [p.id] }) as any, colCtx(collectionId));
      expect(res.status).toBe(401);
      expect((await itemRepo.findByCollection(collectionId)).length).toBe(before);
    });

    it("404s when the collection does not exist — no item created", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await groupPool(jsonReq({ photoIds: ["p1"] }) as any, colCtx("col-absent"));
      expect(res.status).toBe(404);
    });

    it("403s a stranger — photo stays pooled (unchanged)", async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      const p = await poolPhoto(collectionId, "g.jpg");
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const res = await groupPool(jsonReq({ photoIds: [p.id] }) as any, colCtx(collectionId));
      expect(res.status).toBe(403);
      expect((await photoRepo.findById(p.id))!.itemId).toBeNull(); // unchanged
    });

    it("400s an empty photoIds array — no item created", async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const before = (await itemRepo.findByCollection(collectionId)).length;
      const res = await groupPool(jsonReq({ photoIds: [] }) as any, colCtx(collectionId));
      expect(res.status).toBe(400);
      expect((await itemRepo.findByCollection(collectionId)).length).toBe(before);
    });

    it("400s a non-string-array photoIds and malformed JSON", async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      expect((await groupPool(jsonReq({ photoIds: "nope" }) as any, colCtx(collectionId))).status).toBe(400);
      expect((await groupPool(jsonReq({ photoIds: ["p1", 3] }) as any, colCtx(collectionId))).status).toBe(400);
      expect((await groupPool(jsonReq("{not json") as any, colCtx(collectionId))).status).toBe(400);
    });

    it("400s when photoIds exceeds the route-level max (bounded before the service)", async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const ids = Array.from({ length: 51 }, (_, i) => `p${i}`);

      const before = (await itemRepo.findByCollection(collectionId)).length;
      const res = await groupPool(jsonReq({ photoIds: ids }) as any, colCtx(collectionId));
      expect(res.status).toBe(400);
      expect((await itemRepo.findByCollection(collectionId)).length).toBe(before);
    });

    it("409s a grouping conflict (a photo that isn't pooled) — original item created? no", async () => {
      // An ASSIGNED photo id is not "available pooled", so the service rejects with
      // a conflict BEFORE creating any item.
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const [assigned] = await photoRepo.findByItem(itemAId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const before = (await itemRepo.findByCollection(collectionId)).length;
      const res = await groupPool(jsonReq({ photoIds: [assigned.id] }) as any, colCtx(collectionId));
      expect(res.status).toBe(409);
      expect((await itemRepo.findByCollection(collectionId)).length).toBe(before);
    });

    it("201s (combine): creates a new item and the named photos now point to it", async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      const p1 = await poolPhoto(collectionId, "g1.jpg");
      const p2 = await poolPhoto(collectionId, "g2.jpg");
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // before: both photos are pooled (itemId null).
      expect((await photoRepo.findById(p1.id))!.itemId).toBeNull();
      expect((await photoRepo.findById(p2.id))!.itemId).toBeNull();
      const before = (await itemRepo.findByCollection(collectionId)).length;

      const res = await groupPool(jsonReq({ photoIds: [p1.id, p2.id] }) as any, colCtx(collectionId));
      expect(res.status).toBe(201);
      const body = (await res.json()) as { number: number };
      expect(typeof body.number).toBe("number");

      // after: a NEW item exists, and both photos point at the SAME new item; p1 is hero.
      const itemsAfter = await itemRepo.findByCollection(collectionId);
      expect(itemsAfter.length).toBe(before + 1);
      const a1 = (await photoRepo.findById(p1.id))!;
      const a2 = (await photoRepo.findById(p2.id))!;
      expect(a1.itemId).not.toBeNull();
      expect(a2.itemId).toBe(a1.itemId);
      expect(a1.isHero).toBe(true); // first photo becomes hero
      expect(a2.isHero).toBe(false);
    });

    it('201s (mode "each"): makes one item per photo and returns the count', async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      const p1 = await poolPhoto(collectionId, "e1.jpg");
      const p2 = await poolPhoto(collectionId, "e2.jpg");
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const before = (await itemRepo.findByCollection(collectionId)).length;
      const res = await groupPool(
        jsonReq({ photoIds: [p1.id, p2.id], mode: "each" }) as any,
        colCtx(collectionId),
      );
      expect(res.status).toBe(201);
      await expect(res.json()).resolves.toEqual({ count: 2 });

      const itemsAfter = await itemRepo.findByCollection(collectionId);
      expect(itemsAfter.length).toBe(before + 2);
      // each photo on its OWN (distinct) item.
      const a1 = (await photoRepo.findById(p1.id))!;
      const a2 = (await photoRepo.findById(p2.id))!;
      expect(a1.itemId).not.toBeNull();
      expect(a2.itemId).not.toBeNull();
      expect(a1.itemId).not.toBe(a2.itemId);
    });

    it("201s for a member who is not the owner (member-or-owner write tier)", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const p = await poolPhoto(collectionId, "m.jpg");
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await groupPool(jsonReq({ photoIds: [p.id] }) as any, colCtx(collectionId));
      expect(res.status).toBe(201);
      expect((await photoRepo.findById(p.id))!.itemId).not.toBeNull();
    });
  });

  // ===================== POST photos/reassign ============================
  describe("POST photos/reassign", () => {
    it("401s an unauthenticated caller — photo unchanged", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const [assigned] = await photoRepo.findByItem(itemAId);
      mockGetSession.mockResolvedValue(null);

      const res = await reassign(
        jsonReq({ photoIds: [assigned.id], destination: { type: "pool" } }) as any,
        colCtx(collectionId),
      );
      expect(res.status).toBe(401);
      expect((await photoRepo.findById(assigned.id))!.itemId).toBe(itemAId); // unchanged
    });

    it("404s when the collection does not exist", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await reassign(
        jsonReq({ photoIds: ["p1"], destination: { type: "pool" } }) as any,
        colCtx("col-absent"),
      );
      expect(res.status).toBe(404);
    });

    it("403s a stranger — photo stays on its item (unchanged)", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const [assigned] = await photoRepo.findByItem(itemAId);
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const res = await reassign(
        jsonReq({ photoIds: [assigned.id], destination: { type: "pool" } }) as any,
        colCtx(collectionId),
      );
      expect(res.status).toBe(403);
      expect((await photoRepo.findById(assigned.id))!.itemId).toBe(itemAId); // unchanged
    });

    it("400s invalid destination / empty photoIds / malformed JSON — nothing moved", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const [assigned] = await photoRepo.findByItem(itemAId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // unknown destination type
      expect(
        (await reassign(jsonReq({ photoIds: [assigned.id], destination: { type: "bogus" } }) as any, colCtx(collectionId))).status,
      ).toBe(400);
      // destination absent
      expect((await reassign(jsonReq({ photoIds: [assigned.id] }) as any, colCtx(collectionId))).status).toBe(400);
      // {type:"item"} without a string itemId
      expect(
        (await reassign(jsonReq({ photoIds: [assigned.id], destination: { type: "item" } }) as any, colCtx(collectionId))).status,
      ).toBe(400);
      // empty photoIds
      expect((await reassign(jsonReq({ photoIds: [], destination: { type: "new" } }) as any, colCtx(collectionId))).status).toBe(400);
      // malformed JSON
      expect((await reassign(jsonReq("{not json") as any, colCtx(collectionId))).status).toBe(400);
      // photoIds over the route-level max (bounded before the service)
      const ids = Array.from({ length: 51 }, (_, i) => `p${i}`);
      expect(
        (await reassign(jsonReq({ photoIds: ids, destination: { type: "new" } }) as any, colCtx(collectionId))).status,
      ).toBe(400);

      expect((await photoRepo.findById(assigned.id))!.itemId).toBe(itemAId); // nothing moved
    });

    it('200s moving an assigned photo to the pool (itemId -> null)', async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const [assigned] = await photoRepo.findByItem(itemAId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      expect((await photoRepo.findById(assigned.id))!.itemId).toBe(itemAId); // before: assigned
      const res = await reassign(
        jsonReq({ photoIds: [assigned.id], destination: { type: "pool" } }) as any,
        colCtx(collectionId),
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ number: null });
      expect((await photoRepo.findById(assigned.id))!.itemId).toBeNull(); // after: pooled
    });

    it('200s moving a pooled photo to an existing item (itemId updated)', async () => {
      const { collectionId, itemBId } = await seedFullCollection(ownerId);
      const pooled = await poolPhoto(collectionId, "r.jpg");
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      expect((await photoRepo.findById(pooled.id))!.itemId).toBeNull(); // before
      const res = await reassign(
        jsonReq({ photoIds: [pooled.id], destination: { type: "item", itemId: itemBId } }) as any,
        colCtx(collectionId),
      );
      expect(res.status).toBe(200);
      expect((await photoRepo.findById(pooled.id))!.itemId).toBe(itemBId); // after
    });

    it('200s moving pooled photos to a NEW item', async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      const pooled = await poolPhoto(collectionId, "rn.jpg");
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const before = (await itemRepo.findByCollection(collectionId)).length;
      const res = await reassign(
        jsonReq({ photoIds: [pooled.id], destination: { type: "new" } }) as any,
        colCtx(collectionId),
      );
      expect(res.status).toBe(200);
      expect((await itemRepo.findByCollection(collectionId)).length).toBe(before + 1);
      const after = (await photoRepo.findById(pooled.id))!;
      expect(after.itemId).not.toBeNull();
      expect(after.isHero).toBe(true); // first (only) photo on the new item is hero
    });

    it("409s when a named photo isn't available to move — nothing moved", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const [assigned] = await photoRepo.findByItem(itemAId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // "missing" id is not in the collection -> findByIds count mismatch -> conflict.
      const res = await reassign(
        jsonReq({ photoIds: [assigned.id, "photo-missing"], destination: { type: "pool" } }) as any,
        colCtx(collectionId),
      );
      expect(res.status).toBe(409);
      expect((await photoRepo.findById(assigned.id))!.itemId).toBe(itemAId); // unchanged
    });
  });

  // ===================== GET pool/photos/[photoId]/file ==================
  describe("GET pool/photos/[photoId]/file", () => {
    beforeEach(() => {
      // Clear call history per test: vitest has no global clearMocks here, so the
      // "never serves bytes" assertions below would otherwise read calls accumulated
      // from the byte-serving tests and pass only by accident of declaration order.
      mockBlobGet.mockClear();
      // orig-passthrough (no ?w=) for a rotation-0 photo streams this verbatim.
      mockBlobGet.mockResolvedValue({
        statusCode: 200,
        stream: "bytes",
        blob: { contentType: "image/jpeg" },
      });
    });

    function fileReq() {
      return new Request("http://localhost/file");
    }

    it("401s an unauthenticated caller — never serves bytes", async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      const pooled = await poolPhoto(collectionId, "f.jpg");
      mockGetSession.mockResolvedValue(null);

      const res = await servePool(fileReq() as any, photoCtx(collectionId, pooled.id));
      expect(res.status).toBe(401);
      expect(mockBlobGet).not.toHaveBeenCalled();
    });

    it("404s when the photo is ASSIGNED to an item (not pooled) — never serves bytes", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const [assigned] = await photoRepo.findByItem(itemAId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      expect(assigned.itemId).toBe(itemAId); // present before: it IS assigned, so the 404 is non-vacuous
      const res = await servePool(fileReq() as any, photoCtx(collectionId, assigned.id));
      expect(res.status).toBe(404);
      expect(mockBlobGet).not.toHaveBeenCalled();
    });

    it("404s when the photo belongs to another collection", async () => {
      const a = await seedFullCollection(ownerId);
      const b = await seedFullCollection(ownerId);
      const pooled = await poolPhoto(b.collectionId, "other.jpg");
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // photo lives in collection b, requested under collection a -> 404
      const res = await servePool(fileReq() as any, photoCtx(a.collectionId, pooled.id));
      expect(res.status).toBe(404);
      expect(mockBlobGet).not.toHaveBeenCalled();
    });

    it("403s a stranger (neither member nor owner) — never serves bytes", async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      const pooled = await poolPhoto(collectionId, "f.jpg");
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const res = await servePool(fileReq() as any, photoCtx(collectionId, pooled.id));
      expect(res.status).toBe(403);
      expect(mockBlobGet).not.toHaveBeenCalled();
    });

    it("200s and serves the pooled photo for the owner", async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      const pooled = await poolPhoto(collectionId, "f.jpg");
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await servePool(fileReq() as any, photoCtx(collectionId, pooled.id));
      expect(res.status).toBe(200);
      expect(mockBlobGet).toHaveBeenCalledWith(pooled.blobKey, expect.anything());
    });

    it("200s for a member who is not the owner (member-or-owner read tier)", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const pooled = await poolPhoto(collectionId, "f.jpg");
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await servePool(fileReq() as any, photoCtx(collectionId, pooled.id));
      expect(res.status).toBe(200);
    });
  });
});
