// @vitest-environment node
// Honest real-DB integration for the four item-photo routes:
//   POST   /api/collections/[id]/items/[itemId]/photos              (blob `put`)
//   PATCH  /api/collections/[id]/items/[itemId]/photos/[photoId]    (rotate)
//   DELETE /api/collections/[id]/items/[itemId]/photos/[photoId]    (blob `del`)
//   POST   /api/collections/[id]/items/[itemId]/photos/[photoId]/set-hero
// Real handler -> repos -> ephemeral Postgres. Mocks ONLY the three true
// boundaries: auth (so we can drive owner / curator-member / stranger), getDb ->
// the test db, and @vercel/blob (`put`/`del` so the blob store isn't hit — we
// assert put/del WERE called with the right args). `/file` GET is covered by
// file-route-authz.integration.test.ts.
//
// AUTHZ as-implemented (route.ts, post-pv9 PR4 — full-curator model):
//   - POST upload, PATCH rotate, DELETE: photos:write = curator. ANY collection
//     member may add/rotate/delete; the canAddPhotos/canDeletePhotos flags are inert.
//     A true NON-MEMBER stranger -> 403 (asserted per block below).
//   - set-hero: photos:write = curator (any member OR owner; stranger -> 403).
//   404 (item/photo absent or belongs-to-another-parent) is resolved BEFORE the
//   403 permission check on every handler; validation (400) only after authz.
//
// Every "absent/0/gone after" assertion is paired with a "present/non-zero before"
// read via PhotoRepository, so a never-seeded row can't make the suite pass vacuously.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import {
  seedBaseline,
  seedFullCollection,
  seedUserRow,
  FULL_SEED_HTTP_KEY_ACTIVE,
} from "../../../e2e/fixtures/seed";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { AuditLogRepository } from "@/server/repositories/implementations/AuditLogRepository";

const { mockGetSession, mockPut, mockDel } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockPut: vi.fn(),
  mockDel: vi.fn(),
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
vi.mock("@vercel/blob", () => ({
  put: mockPut,
  del: mockDel,
  list: vi.fn().mockResolvedValue({ blobs: [], hasMore: false }),
}));

import { POST as uploadPhoto } from "@/app/api/collections/[id]/items/[itemId]/photos/route";
import {
  PATCH as rotatePhoto,
  DELETE as deletePhoto,
} from "@/app/api/collections/[id]/items/[itemId]/photos/[photoId]/route";
import { POST as setHero } from "@/app/api/collections/[id]/items/[itemId]/photos/[photoId]/set-hero/route";
import { DELETE as deleteItem } from "@/app/api/items/[id]/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

const BLOB_UPLOAD_URL = "https://blob.example/uploaded.jpg";

/** Multipart upload request carrying a single `file` field. */
function uploadReq(file: File | null): Request {
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request("http://localhost/api/upload", { method: "POST", body: form });
}

function imageFile(name = "bag.jpg", type = "image/jpeg", bytes = new Uint8Array([1, 2, 3])): File {
  return new File([bytes], name, { type });
}

/** JSON request the rotate PATCH reads via req.json(). */
function jsonReq(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/photo", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const itemCtx = (id: string, itemId: string) => ({ params: { id, itemId } }) as any;
const photoCtx = (id: string, itemId: string, photoId: string) =>
  ({ params: { id, itemId, photoId } }) as any;

describeDb("item-photo routes (route -> repo -> DB)", () => {
  let ownerId: string;
  let photoRepo: PhotoRepository;
  let membershipRepo: MembershipRepository;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    mockPut.mockResolvedValue({ url: BLOB_UPLOAD_URL });
    mockDel.mockResolvedValue(undefined);
    ownerId = await seedBaseline();
    const { db } = getTestDb();
    photoRepo = new PhotoRepository(db);
    membershipRepo = new MembershipRepository(db);
  });

  afterAll(async () => {
    await closeDb();
  });

  /** The seeded curator member's userId already has canAddPhotos=true,
   *  canDeletePhotos=false (see seedFullCollection). The active hero photo lives
   *  on itemA with an http blobKey; itemB carries a soft-deleted photo. */

  // ===================== POST upload =====================================
  describe("POST upload", () => {
    it("401s an unauthenticated caller — no put, no row created", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue(null);

      const before = (await photoRepo.findByItem(itemAId)).length;
      const res = await uploadPhoto(uploadReq(imageFile()) as any, itemCtx(collectionId, itemAId));
      expect(res.status).toBe(401);
      expect(mockPut).not.toHaveBeenCalled();
      expect((await photoRepo.findByItem(itemAId)).length).toBe(before);
    });

    it("404s when the item is in another collection — no put, no row", async () => {
      const { itemAId } = await seedFullCollection(ownerId);
      const other = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // itemAId belongs to the first collection, but we pass the other collection's id.
      const res = await uploadPhoto(
        uploadReq(imageFile()) as any,
        itemCtx(other.collectionId, itemAId),
      );
      expect(res.status).toBe(404);
      expect(mockPut).not.toHaveBeenCalled();
    });

    it("201s a curator member regardless of canAddPhotos flag (photos:write = curator, full-curator model)", async () => {
      // Full-curator: canAddPhotos flag is inert — any collection member may upload photos.
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const viewerId = await seedUserRow("viewer");
      await membershipRepo.create({
        collectionId,
        userId: viewerId,
        role: "curator",
        canManageCollection: false,
        canInviteMembers: false,
        canAddItems: false,
        canEditMetadata: false,
        canAddPhotos: false,   // flag is inert
        canDeletePhotos: false,
        canSort: false,
        canViewOutputs: true,
      });
      mockGetSession.mockResolvedValue({ user: { id: viewerId } });

      const before = (await photoRepo.findByItem(itemAId)).length;
      const res = await uploadPhoto(uploadReq(imageFile()) as any, itemCtx(collectionId, itemAId));
      expect(res.status).toBe(201);
      expect(mockPut).toHaveBeenCalledOnce();
      expect((await photoRepo.findByItem(itemAId)).length).toBe(before + 1);
    });

    it("403s a NON-MEMBER stranger (photos:write = curator) — no put, no row", async () => {
      // The curator-loosening covers members; this pins that a true outsider with NO
      // membership is still rejected by requireApiCapability (role resolves to null).
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const before = (await photoRepo.findByItem(itemAId)).length;
      const res = await uploadPhoto(uploadReq(imageFile()) as any, itemCtx(collectionId, itemAId));
      expect(res.status).toBe(403);
      expect(mockPut).not.toHaveBeenCalled();
      expect((await photoRepo.findByItem(itemAId)).length).toBe(before);
    });

    it("400s when no file is provided — no put, no row", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await uploadPhoto(uploadReq(null) as any, itemCtx(collectionId, itemAId));
      expect(res.status).toBe(400);
      expect(mockPut).not.toHaveBeenCalled();
    });

    it("413s a file over the server upload limit — BEFORE put, no row", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const { MAX_SERVER_UPLOAD_BYTES } = await import(
        "@/app/api/collections/[id]/items/[itemId]/photos/route"
      );
      const oversize = imageFile(
        "huge.jpg",
        "image/jpeg",
        new Uint8Array(MAX_SERVER_UPLOAD_BYTES + 1),
      );

      const before = (await photoRepo.findByItem(itemAId)).length;
      const res = await uploadPhoto(uploadReq(oversize) as any, itemCtx(collectionId, itemAId));
      expect(res.status).toBe(413);
      expect(mockPut).not.toHaveBeenCalled();
      expect((await photoRepo.findByItem(itemAId)).length).toBe(before);
    });

    it("400s a non-image file — no put, no row", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await uploadPhoto(
        uploadReq(imageFile("notes.txt", "text/plain")) as any,
        itemCtx(collectionId, itemAId),
      );
      expect(res.status).toBe(400);
      expect(mockPut).not.toHaveBeenCalled();
    });

    it("201s for the owner: puts once and creates a real photo row", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const before = (await photoRepo.findByItem(itemAId)).length;
      const res = await uploadPhoto(
        uploadReq(imageFile("bag.jpg")) as any,
        itemCtx(collectionId, itemAId),
      );
      expect(res.status).toBe(201);
      expect(mockPut).toHaveBeenCalledOnce();

      const after = await photoRepo.findByItem(itemAId);
      expect(after.length).toBe(before + 1);
      // The created row stores the blob URL `put` returned, scoped to this item/collection.
      const created = after.find((p) => p.blobKey === BLOB_UPLOAD_URL);
      expect(created).toBeDefined();
      expect(created!.collectionId).toBe(collectionId);
      expect(created!.uploadedBy).toBe(ownerId);
      expect(created!.filename).toBe("bag.jpg");
      expect(created!.isHero).toBe(false);
    });

    it("201s for a member WITH canAddPhotos (write tier)", async () => {
      const { collectionId, itemAId, memberId } = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const before = (await photoRepo.findByItem(itemAId)).length;
      const res = await uploadPhoto(uploadReq(imageFile()) as any, itemCtx(collectionId, itemAId));
      expect(res.status).toBe(201);
      expect(mockPut).toHaveBeenCalledOnce();
      expect((await photoRepo.findByItem(itemAId)).length).toBe(before + 1);
    });
  });

  // ===================== PATCH rotate ====================================
  describe("PATCH rotate", () => {
    /** The active hero photo on itemA (rotation 0 as seeded). */
    async function heroPhoto(itemAId: string) {
      const [photo] = await photoRepo.findByItem(itemAId);
      return photo;
    }

    it("401s an unauthenticated caller — rotation unchanged", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const photo = await heroPhoto(itemAId);
      mockGetSession.mockResolvedValue(null);

      expect(photo.rotation).toBe(0);
      const res = await rotatePhoto(jsonReq("PATCH", { rotation: 90 }) as any, photoCtx(collectionId, itemAId, photo.id));
      expect(res.status).toBe(401);
      expect((await photoRepo.findById(photo.id))!.rotation).toBe(0);
    });

    it("404s when the item is absent — no write", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const photo = await heroPhoto(itemAId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await rotatePhoto(
        jsonReq("PATCH", { rotation: 90 }) as any,
        photoCtx(collectionId, "item-absent", photo.id),
      );
      expect(res.status).toBe(404);
      expect((await photoRepo.findById(photo.id))!.rotation).toBe(0);
    });

    it("404s when the photo is not on this item (belongs-to-parent) — unchanged", async () => {
      const { collectionId, itemAId, itemBId } = await seedFullCollection(ownerId);
      // itemB's (soft-deleted) photo is not on itemA; but use a fresh photo on itemB.
      const bPhoto = await photoRepo.create({
        itemId: itemBId,
        collectionId,
        blobKey: "https://blob.example/b.jpg",
        filename: "b.jpg",
        mimeType: "image/jpeg",
        fileSize: 1,
        uploadedBy: ownerId,
        isHero: false,
      });
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await rotatePhoto(
        jsonReq("PATCH", { rotation: 90 }) as any,
        photoCtx(collectionId, itemAId, bPhoto.id),
      );
      expect(res.status).toBe(404);
      expect((await photoRepo.findById(bPhoto.id))!.rotation).toBe(0);
    });

    it("200s a curator member regardless of canAddPhotos flag and persists rotation (photos:write = curator)", async () => {
      // Full-curator: canAddPhotos flag is inert — any collection member may rotate photos.
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const photo = await heroPhoto(itemAId);
      const viewerId = await seedUserRow("viewer");
      await membershipRepo.create({
        collectionId,
        userId: viewerId,
        role: "curator",
        canManageCollection: false,
        canInviteMembers: false,
        canAddItems: false,
        canEditMetadata: false,
        canAddPhotos: false,   // flag is inert
        canDeletePhotos: false,
        canSort: false,
        canViewOutputs: true,
      });
      mockGetSession.mockResolvedValue({ user: { id: viewerId } });

      expect(photo.rotation).toBe(0); // before
      const res = await rotatePhoto(
        jsonReq("PATCH", { rotation: 90 }) as any,
        photoCtx(collectionId, itemAId, photo.id),
      );
      expect(res.status).toBe(200);
      expect((await photoRepo.findById(photo.id))!.rotation).toBe(90);
    });

    it("403s a NON-MEMBER stranger (photos:write = curator) — rotation unchanged", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const photo = await heroPhoto(itemAId);
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      expect(photo.rotation).toBe(0); // before
      const res = await rotatePhoto(
        jsonReq("PATCH", { rotation: 90 }) as any,
        photoCtx(collectionId, itemAId, photo.id),
      );
      expect(res.status).toBe(403);
      expect((await photoRepo.findById(photo.id))!.rotation).toBe(0); // unchanged
    });

    it("400s a non-allowlisted rotation — unchanged", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const photo = await heroPhoto(itemAId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      expect((await rotatePhoto(jsonReq("PATCH", { rotation: 45 }) as any, photoCtx(collectionId, itemAId, photo.id))).status).toBe(400);
      expect((await rotatePhoto(jsonReq("PATCH", { rotation: "90" }) as any, photoCtx(collectionId, itemAId, photo.id))).status).toBe(400);
      expect((await rotatePhoto(jsonReq("PATCH", "not json") as any, photoCtx(collectionId, itemAId, photo.id))).status).toBe(400);
      expect((await photoRepo.findById(photo.id))!.rotation).toBe(0);
    });

    it("200s for the owner and persists the rotation", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const photo = await heroPhoto(itemAId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      expect(photo.rotation).toBe(0); // before
      const res = await rotatePhoto(
        jsonReq("PATCH", { rotation: 270 }) as any,
        photoCtx(collectionId, itemAId, photo.id),
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ rotation: 270 });
      expect((await photoRepo.findById(photo.id))!.rotation).toBe(270); // after
    });

    it("200s for a member WITH canAddPhotos and persists the rotation", async () => {
      const { collectionId, itemAId, memberId } = await seedFullCollection(ownerId);
      const photo = await heroPhoto(itemAId);
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await rotatePhoto(
        jsonReq("PATCH", { rotation: 180 }) as any,
        photoCtx(collectionId, itemAId, photo.id),
      );
      expect(res.status).toBe(200);
      expect((await photoRepo.findById(photo.id))!.rotation).toBe(180);
    });
  });

  // ===================== DELETE photo ====================================
  describe("DELETE photo", () => {
    async function heroPhoto(itemAId: string) {
      const [photo] = await photoRepo.findByItem(itemAId);
      return photo;
    }

    it("401s an unauthenticated caller — no del, row survives", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const photo = await heroPhoto(itemAId);
      mockGetSession.mockResolvedValue(null);

      const res = await deletePhoto(jsonReq("DELETE") as any, photoCtx(collectionId, itemAId, photo.id));
      expect(res.status).toBe(401);
      expect(mockDel).not.toHaveBeenCalled();
      expect(await photoRepo.findById(photo.id)).not.toBeNull();
    });

    it("404s when the item is absent — no del", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const photo = await heroPhoto(itemAId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await deletePhoto(
        jsonReq("DELETE") as any,
        photoCtx(collectionId, "item-absent", photo.id),
      );
      expect(res.status).toBe(404);
      expect(mockDel).not.toHaveBeenCalled();
      expect(await photoRepo.findById(photo.id)).not.toBeNull();
    });

    it("404s when the photo is not on this item (belongs-to-parent) — survives", async () => {
      const { collectionId, itemAId, itemBId } = await seedFullCollection(ownerId);
      const bPhoto = await photoRepo.create({
        itemId: itemBId,
        collectionId,
        blobKey: "https://blob.example/b.jpg",
        filename: "b.jpg",
        mimeType: "image/jpeg",
        fileSize: 1,
        uploadedBy: ownerId,
        isHero: false,
      });
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await deletePhoto(
        jsonReq("DELETE") as any,
        photoCtx(collectionId, itemAId, bPhoto.id),
      );
      expect(res.status).toBe(404);
      expect(mockDel).not.toHaveBeenCalled();
      expect(await photoRepo.findById(bPhoto.id)).not.toBeNull();
    });

    it("200s a curator member regardless of canDeletePhotos flag and removes the row (photos:write = curator)", async () => {
      // Full-curator: canDeletePhotos flag is inert — any collection member may delete photos.
      // seedFullCollection's curator member has canDeletePhotos=false (flag is now inert).
      const { collectionId, itemAId, memberId } = await seedFullCollection(ownerId);
      const photo = await heroPhoto(itemAId);
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      expect(await photoRepo.findById(photo.id)).not.toBeNull(); // present before
      const res = await deletePhoto(
        jsonReq("DELETE") as any,
        photoCtx(collectionId, itemAId, photo.id),
      );
      expect(res.status).toBe(200);
      expect(mockDel).toHaveBeenCalled();
      expect(await photoRepo.findById(photo.id)).toBeNull(); // gone after
    });

    it("403s a NON-MEMBER stranger (photos:write = curator) — no del, row survives", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const photo = await heroPhoto(itemAId);
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      expect(await photoRepo.findById(photo.id)).not.toBeNull(); // present before
      const res = await deletePhoto(
        jsonReq("DELETE") as any,
        photoCtx(collectionId, itemAId, photo.id),
      );
      expect(res.status).toBe(403);
      expect(mockDel).not.toHaveBeenCalled();
      expect(await photoRepo.findById(photo.id)).not.toBeNull(); // survives
    });

    it("200s for the owner: dels the photo's http blobKey and removes the row (present before, gone after)", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const photo = await heroPhoto(itemAId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      expect(photo.blobKey).toBe(FULL_SEED_HTTP_KEY_ACTIVE);
      expect(await photoRepo.findById(photo.id)).not.toBeNull(); // present before

      const res = await deletePhoto(
        jsonReq("DELETE") as any,
        photoCtx(collectionId, itemAId, photo.id),
      );
      expect(res.status).toBe(200);
      expect(mockDel).toHaveBeenCalledWith(FULL_SEED_HTTP_KEY_ACTIVE);
      expect(await photoRepo.findById(photo.id)).toBeNull(); // gone after
    });

    it("200s for a stranger-but-member curator and removes the row (flag=false, still allowed)", async () => {
      // canDeletePhotos=false is irrelevant; any curator satisfies photos:write.
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const photo = await heroPhoto(itemAId);
      const deleterId = await seedUserRow("deleter");
      await membershipRepo.create({
        collectionId,
        userId: deleterId,
        role: "curator",
        canManageCollection: false,
        canInviteMembers: false,
        canAddItems: false,
        canEditMetadata: false,
        canAddPhotos: false,
        canDeletePhotos: false, // inert
        canSort: false,
        canViewOutputs: true,
      });
      mockGetSession.mockResolvedValue({ user: { id: deleterId } });

      expect(await photoRepo.findById(photo.id)).not.toBeNull();
      const res = await deletePhoto(
        jsonReq("DELETE") as any,
        photoCtx(collectionId, itemAId, photo.id),
      );
      expect(res.status).toBe(200);
      expect(await photoRepo.findById(photo.id)).toBeNull();
    });

    it("does NOT del a non-http blobKey but still removes the row", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const localPhoto = await photoRepo.create({
        itemId: itemAId,
        collectionId,
        blobKey: "local-store-key", // not http -> del skipped
        filename: "local.jpg",
        mimeType: "image/jpeg",
        fileSize: 1,
        uploadedBy: ownerId,
        isHero: false,
      });
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await deletePhoto(
        jsonReq("DELETE") as any,
        photoCtx(collectionId, itemAId, localPhoto.id),
      );
      expect(res.status).toBe(200);
      expect(mockDel).not.toHaveBeenCalled();
      expect(await photoRepo.findById(localPhoto.id)).toBeNull();
    });
  });

  // ===================== POST set-hero ===================================
  describe("POST set-hero", () => {
    /** Seed a SECOND photo on itemA so set-hero has a non-hero target to promote. */
    async function secondPhotoOnItemA(collectionId: string, itemAId: string) {
      return photoRepo.create({
        itemId: itemAId,
        collectionId,
        blobKey: "https://blob.example/second.jpg",
        filename: "second.jpg",
        mimeType: "image/jpeg",
        fileSize: 1,
        uploadedBy: ownerId,
        isHero: false,
      });
    }

    it("401s an unauthenticated caller — hero unchanged", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const second = await secondPhotoOnItemA(collectionId, itemAId);
      mockGetSession.mockResolvedValue(null);

      const res = await setHero(jsonReq("POST") as any, photoCtx(collectionId, itemAId, second.id));
      expect(res.status).toBe(401);
      expect((await photoRepo.findById(second.id))!.isHero).toBe(false);
    });

    it("404s when the item is in another collection — does NOT set hero", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const second = await secondPhotoOnItemA(collectionId, itemAId);
      const other = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await setHero(jsonReq("POST") as any, photoCtx(other.collectionId, itemAId, second.id));
      expect(res.status).toBe(404);
      expect((await photoRepo.findById(second.id))!.isHero).toBe(false);
    });

    it("404s when the photo is not on this item — does NOT set hero", async () => {
      const { collectionId, itemAId, itemBId } = await seedFullCollection(ownerId);
      const bPhoto = await photoRepo.create({
        itemId: itemBId,
        collectionId,
        blobKey: "https://blob.example/b.jpg",
        filename: "b.jpg",
        mimeType: "image/jpeg",
        fileSize: 1,
        uploadedBy: ownerId,
        isHero: false,
      });
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await setHero(jsonReq("POST") as any, photoCtx(collectionId, itemAId, bPhoto.id));
      expect(res.status).toBe(404);
      expect((await photoRepo.findById(bPhoto.id))!.isHero).toBe(false);
    });

    it("403s a stranger (neither member nor owner) — does NOT set hero", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const second = await secondPhotoOnItemA(collectionId, itemAId);
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const res = await setHero(jsonReq("POST") as any, photoCtx(collectionId, itemAId, second.id));
      expect(res.status).toBe(403);
      expect((await photoRepo.findById(second.id))!.isHero).toBe(false);
    });

    it("200s for the owner: promotes the target AND demotes the prior hero (one hero per item)", async () => {
      const { collectionId, itemAId } = await seedFullCollection(ownerId);
      const [priorHero] = await photoRepo.findByItem(itemAId);
      const second = await secondPhotoOnItemA(collectionId, itemAId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // Before: the seeded photo is hero, the second is not.
      expect((await photoRepo.findById(priorHero.id))!.isHero).toBe(true);
      expect((await photoRepo.findById(second.id))!.isHero).toBe(false);

      const res = await setHero(jsonReq("POST") as any, photoCtx(collectionId, itemAId, second.id));
      expect(res.status).toBe(200);

      // After: the flip is exact — the target is hero, the prior hero is demoted.
      expect((await photoRepo.findById(second.id))!.isHero).toBe(true);
      expect((await photoRepo.findById(priorHero.id))!.isHero).toBe(false);
    });

    it("200s for a member (member-or-owner access tier) and flips the hero", async () => {
      const { collectionId, itemAId, memberId } = await seedFullCollection(ownerId);
      const [priorHero] = await photoRepo.findByItem(itemAId);
      const second = await secondPhotoOnItemA(collectionId, itemAId);
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await setHero(jsonReq("POST") as any, photoCtx(collectionId, itemAId, second.id));
      expect(res.status).toBe(200);
      expect((await photoRepo.findById(second.id))!.isHero).toBe(true);
      expect((await photoRepo.findById(priorHero.id))!.isHero).toBe(false);
    });
  });
});

// ============================================================================
// purses-wfgj — audit attribution for soft-delete (item.delete) and photo delete
// (photo.delete). Real handler → AuditLogRepository → ephemeral Postgres.
// Asserts the audit row exists with the correct action, actorId, targetId, and
// collectionId after the operation succeeds, and that the soft-delete + audit
// insert are tx-bound: exactly ONE audit row per committed delete (atomicity).
// ============================================================================
describeDb("purses-wfgj: audit attribution for item soft-delete and photo delete", () => {
  let ownerId: string;
  let auditRepo: AuditLogRepository;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    mockPut.mockResolvedValue({ url: BLOB_UPLOAD_URL });
    mockDel.mockResolvedValue(undefined);
    ownerId = await seedBaseline();
    const { db } = getTestDb();
    auditRepo = new AuditLogRepository(db);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("item soft-delete: curator gets 200 and an item.delete audit row with actorId=curator", async () => {
    const { collectionId, itemAId, memberId } = await seedFullCollection(ownerId);
    mockGetSession.mockResolvedValue({ user: { id: memberId } });

    const res = await deleteItem(
      new Request(`http://localhost/api/items/${itemAId}`, { method: "DELETE" }) as any,
      { params: { id: itemAId } },
    );
    expect(res.status).toBe(200);

    // Audit row must exist with exact attribution.
    const rows = await auditRepo.findByCollection(collectionId);
    const deleteRows = rows.filter((r) => r.action === "item.delete");
    // Tx-bound: exactly one audit row per committed soft-delete (atomicity).
    expect(deleteRows).toHaveLength(1);
    expect(deleteRows[0]).toMatchObject({
      action: "item.delete",
      targetType: "item",
      targetId: itemAId,
      collectionId,
      actorId: memberId,
    });
  });

  it("item soft-delete: owner gets 200 and an item.delete audit row with actorId=owner", async () => {
    const { collectionId, itemAId } = await seedFullCollection(ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await deleteItem(
      new Request(`http://localhost/api/items/${itemAId}`, { method: "DELETE" }) as any,
      { params: { id: itemAId } },
    );
    expect(res.status).toBe(200);

    const rows = await auditRepo.findByCollection(collectionId);
    const row = rows.find((r) => r.action === "item.delete");
    expect(row).toBeDefined();
    expect(row!.actorId).toBe(ownerId);
    expect(row!.targetId).toBe(itemAId);
  });

  it("photo delete: curator gets 200 and a photo.delete audit row with actorId=curator", async () => {
    const { collectionId, itemAId, memberId } = await seedFullCollection(ownerId);
    const { db } = getTestDb();
    const photoRepo = new PhotoRepository(db);
    const [photo] = await photoRepo.findByItem(itemAId);
    mockGetSession.mockResolvedValue({ user: { id: memberId } });

    const res = await deletePhoto(
      jsonReq("DELETE") as any,
      { params: { id: collectionId, itemId: itemAId, photoId: photo.id } } as any,
    );
    expect(res.status).toBe(200);

    const rows = await auditRepo.findByCollection(collectionId);
    const deleteRows = rows.filter((r) => r.action === "photo.delete");
    // Tx-bound: exactly one audit row per committed photo delete (atomicity).
    expect(deleteRows).toHaveLength(1);
    expect(deleteRows[0]).toMatchObject({
      action: "photo.delete",
      targetType: "photo",
      targetId: photo.id,
      collectionId,
      actorId: memberId,
    });
  });

  it("photo delete: owner gets 200 and a photo.delete audit row with actorId=owner", async () => {
    const { collectionId, itemAId } = await seedFullCollection(ownerId);
    const { db } = getTestDb();
    const photoRepo = new PhotoRepository(db);
    const [photo] = await photoRepo.findByItem(itemAId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await deletePhoto(
      jsonReq("DELETE") as any,
      { params: { id: collectionId, itemId: itemAId, photoId: photo.id } } as any,
    );
    expect(res.status).toBe(200);

    const rows = await auditRepo.findByCollection(collectionId);
    const row = rows.find((r) => r.action === "photo.delete");
    expect(row).toBeDefined();
    expect(row!.actorId).toBe(ownerId);
    expect(row!.targetId).toBe(photo.id);
    expect(row!.collectionId).toBe(collectionId);
  });
});
