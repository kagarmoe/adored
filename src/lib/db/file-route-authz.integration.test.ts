// src/lib/db/file-route-authz.integration.test.ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";

const { mockGetSession, mockBlobGet } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockBlobGet: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@vercel/blob", () => ({ get: mockBlobGet }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

// Route imported via the @/ alias (literal [id]/[itemId]/... are real dirs).
import { GET } from "@/app/api/collections/[id]/items/[itemId]/photos/[photoId]/file/route";

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
    mockBlobGet.mockResolvedValue({ statusCode: 200, stream: "bytes", blob: { contentType: "image/jpeg" } });
  });

  afterAll(async () => { await closeDb(); });

  function req() { return new Request("http://localhost/file"); }

  it("404s when the collection segment is a slug, not the owning ULID", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await GET(req() as any, { params: { id: "summer-bags", itemId, photoId } });
    expect(res.status).toBe(404);
  });

  it("200s for the owner with the correct collection.id", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await GET(req() as any, { params: { id: collectionId, itemId, photoId } });
    expect(res.status).toBe(200);
  });

  it("403s for a non-member hitting another tenant's collection.id (IDOR)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await GET(req() as any, { params: { id: collectionId, itemId, photoId } });
    expect(res.status).toBe(403);
  });
});
