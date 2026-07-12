// @vitest-environment node
// src/lib/db/file-route-authz.integration.test.ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedUserRow } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

const { mockGetSession, mockBlobGet } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockBlobGet: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@vercel/blob", () => ({ get: mockBlobGet }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

// Route imported via the @/ alias (literal [id]/[itemId]/... are real dirs).
import { GET } from "@/app/api/collections/[id]/items/[itemId]/photos/[photoId]/file/route";
import { GET as GET_POOL } from "@/app/api/collections/[id]/pool/photos/[photoId]/file/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("GET /file authorization seam (route -> DB)", () => {
  let ownerId: string;
  let collectionId: string;
  let itemId: string;
  let photoId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
    const { db } = getTestDb();
    collectionId = "col_file_seam";
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'File seam test', 'active', now(), now())
    `);
    const item = await new ItemRepository(db).create({ collectionId });
    itemId = item.id;
    const photo = await new PhotoRepository(db).create({
      itemId, collectionId, blobKey: "k", filename: "k.jpg",
      mimeType: "image/jpeg", fileSize: 1, uploadedBy: ownerId, isHero: true,
    });
    photoId = photo.id;
    // Clear call history per test: without this the "never serves bytes" assertions
    // read calls accumulated from the earlier 200-status tests, and only pass by
    // accident of declaration order.
    mockBlobGet.mockClear();
    mockBlobGet.mockResolvedValue({ statusCode: 200, stream: "bytes", blob: { contentType: "image/jpeg" } });
  });

  afterAll(async () => { await closeDb(); });

  function req() { return new Request("http://localhost/file"); }

  it("401s an unauthenticated caller — never serves bytes", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(req() as any, { params: { id: collectionId, itemId, photoId } });
    expect(res.status).toBe(401);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("404s when the collection segment is a slug, not the owning ULID", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await GET(req() as any, { params: { id: "summer-bags", itemId, photoId } });
    expect(res.status).toBe(404);
  });

  it("404s when the photo is not on this item (belongs-to-parent) — never serves bytes", async () => {
    // A second item in the SAME collection with its own photo: requesting it via
    // the first item's [itemId] must 404, not leak another item's photo.
    const { db } = getTestDb();
    const otherItem = await new ItemRepository(db).create({ collectionId });
    const otherPhoto = await new PhotoRepository(db).create({
      itemId: otherItem.id, collectionId, blobKey: "k2", filename: "k2.jpg",
      mimeType: "image/jpeg", fileSize: 1, uploadedBy: ownerId, isHero: false,
    });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await GET(req() as any, { params: { id: collectionId, itemId, photoId: otherPhoto.id } });
    expect(res.status).toBe(404);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("200s for the owner with the correct collection.id", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await GET(req() as any, { params: { id: collectionId, itemId, photoId } });
    expect(res.status).toBe(200);
  });

  it("200s for a NON-owner member (member-or-owner read tier)", async () => {
    // Closes the membership-but-not-owner success branch: a curator member with no
    // photo permissions still reads /file (the file gate is bare member-or-owner).
    const memberId = await seedUserRow("file-member");
    await new MembershipRepository(getTestDb().db).create({
      collectionId, userId: memberId, role: "curator",
    });
    mockGetSession.mockResolvedValue({ user: { id: memberId } });
    const res = await GET(req() as any, { params: { id: collectionId, itemId, photoId } });
    expect(res.status).toBe(200);
  });

  // ── No existence oracle for a stranger (purses-ct0) ────────────────────────
  // A non-member must not be able to tell "this photo exists in that collection"
  // from "it doesn't". Both must answer identically, because authz is decided
  // BEFORE existence — the route knows the collectionId from the URL, so it never
  // needs to resolve the item to know the caller has no business here.
  describe("stranger (non-member) gets no existence oracle", () => {
    beforeEach(async () => {
      const strangerId = await seedUserRow("file-stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
    });

    it("item /file: a real photo and a nonexistent one are indistinguishable", async () => {
      const real = await GET(req() as any, { params: { id: collectionId, itemId, photoId } });
      const fake = await GET(req() as any, {
        params: { id: collectionId, itemId: "item_does_not_exist", photoId: "photo_does_not_exist" },
      });

      expect(real.status).toBe(403);
      expect(fake.status).toBe(real.status);
      expect(mockBlobGet).not.toHaveBeenCalled();
    });

    it("pool /file: a real pooled photo and a nonexistent one are indistinguishable", async () => {
      const pooled = await new PhotoRepository(getTestDb().db).create({
        itemId: null, collectionId, blobKey: "pk", filename: "pk.jpg",
        mimeType: "image/jpeg", fileSize: 1, uploadedBy: ownerId, isHero: false,
      });

      const real = await GET_POOL(req() as any, {
        params: { id: collectionId, photoId: pooled.id },
      });
      const fake = await GET_POOL(req() as any, {
        params: { id: collectionId, photoId: "photo_does_not_exist" },
      });

      expect(real.status).toBe(403);
      expect(fake.status).toBe(real.status);
      expect(mockBlobGet).not.toHaveBeenCalled();
    });
  });

});
