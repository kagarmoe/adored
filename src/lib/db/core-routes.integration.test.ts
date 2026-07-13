// Real-DB integration tests for the UI-wired core routes (Group E).
// Route → controller/repo → ephemeral Postgres. Mocks ONLY:
//   - getSession / requireAuth (via mockAuth factory)
//   - @/lib/db → getTestDb
// No @vercel/blob mock needed (none of these routes touch blob storage).
//
// authz gap (pv9): items POST (/api/items?collectionId=...) does NOT verify
// that the authenticated user is a member of the target collection — any
// authenticated user can insert items into any collection. Flagged; not fixed here.
//
// @vitest-environment node

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedFullCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

// ---- hoisted spies ---------------------------------------------------------
const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
}));

// Flat-replace BOTH auth exports from one factory — never importActual (pulls nodemailer).
vi.mock("@/lib/auth", () => mockAuth(mockGetSession));

// Route handlers see the test DB via this mock.
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

// ---- route imports (after mocks) -------------------------------------------
import { GET as collectionsGet, POST as collectionsPost } from "@/app/api/collections/route";
import {
  GET as collectionGet,
  PATCH as collectionPatch,
  DELETE as collectionDelete,
} from "@/app/api/collections/[id]/route";
import { PATCH as itemPatch } from "@/app/api/collections/[id]/items/[itemId]/route";
import { POST as itemsPost } from "@/app/api/items/route";

// ---- helpers ---------------------------------------------------------------

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function nextReq(
  method: string,
  url: string,
  body?: unknown,
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ============================================================================
describeDb("Group E — core route integration tests (real DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  // ==========================================================================
  // GET /api/collections
  // ==========================================================================
  describe("GET /api/collections", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const res = await collectionsGet();
      expect(res.status).toBe(401);
    });

    it("returns only the caller's own collections", async () => {
      const otherId = await seedUserRow("other-owner");

      // Owner has a full seeded collection; other user has their own
      const seed = await seedFullCollection(ownerId);
      const otherId2 = await seedBareCollection(otherId);

      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await collectionsGet();
      expect(res.status).toBe(200);
      const collections = await res.json();
      const ids = collections.map((c: any) => c.id);
      expect(ids).toContain(seed.collectionId);
      // Should not contain the other owner's collection
      expect(ids).not.toContain(otherId2);
    });
  });

  // ==========================================================================
  // POST /api/collections
  // ==========================================================================
  describe("POST /api/collections", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const res = await collectionsPost(
        nextReq("POST", "http://localhost/api/collections", { name: "New Collection" }),
      );
      expect(res.status).toBe(401);
    });

    it("creates a collection owned by the session user and an owner membership row", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await collectionsPost(
        nextReq("POST", "http://localhost/api/collections", { name: "My New Collection" }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.name).toBe("My New Collection");
      // ownerId must come from session, not body
      expect(body.ownerId).toBe(ownerId);

      // Assert DB row
      const { db } = getTestDb();
      const collectionRepo = new CollectionRepository(db);
      const row = await collectionRepo.findById(body.id);
      expect(row).not.toBeNull();
      expect(row!.ownerId).toBe(ownerId);

      // Assert owner membership row
      const membershipRepo = new MembershipRepository(db);
      const membership = await membershipRepo.findByUser(ownerId, body.id);
      expect(membership).not.toBeNull();
      expect(membership!.role).toBe("owner");
    });

    it("membership create failure rolls back collection — no orphan collection (atomic)", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const { db } = getTestDb();
      const before = await new CollectionRepository(db).findByOwner(ownerId);

      // Spy on MembershipRepository.prototype.create to reject once
      const { MembershipRepository: MR } = await import(
        "@/server/repositories/implementations/MembershipRepository"
      );
      const spy = vi
        .spyOn(MR.prototype, "create")
        .mockRejectedValueOnce(new Error("DB failure"));

      const res = await collectionsPost(
        nextReq("POST", "http://localhost/api/collections", { name: "Atomic Test" }),
      );
      expect(res.status).toBe(500);

      // No orphan collection
      const after = await new CollectionRepository(db).findByOwner(ownerId);
      expect(after).toHaveLength(before.length);

      spy.mockRestore();
    });

    it("returns 400 for missing name — no collection created (purses-pv9)", async () => {
      // CollectionController.createCollection CreateCollectionSchema.parse()es the body;
      // a missing name is a ZodError, now mapped to 400 by errorResponse (was 500).
      const { db } = getTestDb();
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const before = await new CollectionRepository(db).findByOwner(ownerId);
      const res = await collectionsPost(
        nextReq("POST", "http://localhost/api/collections", {}),
      );
      expect(res.status).toBe(400);
      // No collection was created for the owner.
      expect(await new CollectionRepository(db).findByOwner(ownerId)).toHaveLength(before.length);
    });
  });

  // ==========================================================================
  // GET /api/collections/[id]
  // ==========================================================================
  describe("GET /api/collections/[id]", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const res = await collectionGet(
        nextReq("GET", "http://localhost/api/collections/any"),
        { params: Promise.resolve({ id: "any" }) },
      );
      expect(res.status).toBe(401);
    });

    it("404s an absent collection id (resolve-then-authorize)", async () => {
      // purses-55c: GET /api/collections/[id] now runs requireApiCollectionAccess,
      // which resolves the collection first — an absent id is a clean 404 (was a
      // 500 from the controller throwing "Collection not found").
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await collectionGet(
        nextReq("GET", "http://localhost/api/collections/col-absent"),
        { params: Promise.resolve({ id: "col-absent" }) },
      );
      expect(res.status).toBe(404);
    });

    it("returns the collection for a member of the collection", async () => {
      const seed = await seedFullCollection(ownerId);
      // Log in as the member (not the owner) — a member may read the collection.
      mockGetSession.mockResolvedValue({ user: { id: seed.memberId } });
      const res = await collectionGet(
        nextReq("GET", `http://localhost/api/collections/${seed.collectionId}`),
        { params: Promise.resolve({ id: seed.collectionId }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(seed.collectionId);
      expect(body.name).toBe(seed.name);
    });
  });

  // ==========================================================================
  // PATCH /api/collections/[id]
  // ==========================================================================
  describe("PATCH /api/collections/[id]", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const seed = await seedFullCollection(ownerId);
      const res = await collectionPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed.collectionId}`, {
          name: "Updated",
        }),
        { params: Promise.resolve({ id: seed.collectionId }) },
      );
      expect(res.status).toBe(401);
    });

    it("owner can update name — asserts real column change in DB", async () => {
      const seed = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await collectionPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed.collectionId}`, {
          name: "Renamed Collection",
        }),
        { params: Promise.resolve({ id: seed.collectionId }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("Renamed Collection");

      // Assert the DB row changed
      const { db } = getTestDb();
      const repo = new CollectionRepository(db);
      const row = await repo.findById(seed.collectionId);
      expect(row!.name).toBe("Renamed Collection");
    });

    it("returns 403 for a curator member (collection:manage = owner only)", async () => {
      // collection:manage requires owner role — a curator member always gets 403.
      const seed = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: seed.memberId } });
      const res = await collectionPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed.collectionId}`, {
          name: "Member Attempted Rename",
        }),
        { params: Promise.resolve({ id: seed.collectionId }) },
      );
      expect(res.status).toBe(403);
    });

    it("owner gets 400 on an invalid body (bad status enum) via errorResponse — no mutation (purses-pv9)", async () => {
      // updateCollection UpdateCollectionSchema.parse()es the body; an out-of-enum
      // status is a ZodError, now mapped to 400 by errorResponse (was 500). The 403
      // owner guard runs BEFORE the parse, so authz is unchanged.
      const seed = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const { db } = getTestDb();
      const before = await new CollectionRepository(db).findById(seed.collectionId);

      const res = await collectionPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed.collectionId}`, {
          status: "not-a-status",
        }),
        { params: Promise.resolve({ id: seed.collectionId }) },
      );
      expect(res.status).toBe(400);
      // Unchanged: name and status are exactly as seeded.
      const after = await new CollectionRepository(db).findById(seed.collectionId);
      expect(after!.name).toBe(before!.name);
      expect(after!.status).toBe(before!.status);
    });
  });

  // ==========================================================================
  // DELETE /api/collections/[id]
  // ==========================================================================
  describe("DELETE /api/collections/[id]", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const seed = await seedFullCollection(ownerId);
      const res = await collectionDelete(
        nextReq("DELETE", `http://localhost/api/collections/${seed.collectionId}`),
        { params: Promise.resolve({ id: seed.collectionId }) },
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when non-owner tries to delete", async () => {
      const seed = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: seed.memberId } });
      const res = await collectionDelete(
        nextReq("DELETE", `http://localhost/api/collections/${seed.collectionId}`),
        { params: Promise.resolve({ id: seed.collectionId }) },
      );
      expect(res.status).toBe(403);

      // Collection still exists
      const { db } = getTestDb();
      const repo = new CollectionRepository(db);
      const row = await repo.findById(seed.collectionId);
      expect(row).not.toBeNull();
    });

    it("owner can soft-delete — row has deletedAt set, findById returns null", async () => {
      const seed = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await collectionDelete(
        nextReq("DELETE", `http://localhost/api/collections/${seed.collectionId}`),
        { params: Promise.resolve({ id: seed.collectionId }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe("Collection deleted");

      // findById filters deletedAt; findByIdIncludingDeleted proves soft-delete
      const { db } = getTestDb();
      const repo = new CollectionRepository(db);
      expect(await repo.findById(seed.collectionId)).toBeNull();
      const withDeleted = await repo.findByIdIncludingDeleted(seed.collectionId);
      expect(withDeleted).not.toBeNull();
      expect(withDeleted!.deletedAt).not.toBeNull();
    });

  });

  // ==========================================================================
  // PATCH /api/collections/[id]/items/[itemId]
  // ==========================================================================
  describe("PATCH /api/collections/[id]/items/[itemId]", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const seed = await seedFullCollection(ownerId);
      const res = await itemPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed.collectionId}/items/${seed.itemAId}`, {
          name: "Updated Name",
        }),
        { params: Promise.resolve({ id: seed.collectionId, itemId: seed.itemAId }) },
      );
      expect(res.status).toBe(401);
    });

    it("returns 404 when item does not belong to the collection", async () => {
      const seed = await seedFullCollection(ownerId);
      // Create a second collection to get an item with a different collectionId
      const seed2 = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // Ensure the owner has membership in seed2 collection too
      const { db } = getTestDb();
      const membershipRepo = new MembershipRepository(db);
      await membershipRepo.create({
        collectionId: seed2.collectionId,
        userId: ownerId,
        role: "owner",
      });

      // itemAId belongs to seed, not seed2
      const res = await itemPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed2.collectionId}/items/${seed.itemAId}`, {
          name: "Wrong Collection Item",
        }),
        { params: Promise.resolve({ id: seed2.collectionId, itemId: seed.itemAId }) },
      );
      expect(res.status).toBe(404);
    });


    it("curator member can update item metadata (items:write = curator, full-curator model)", async () => {
      // items:write = curator — any collection member may edit metadata (canEditMetadata flag is inert).
      const seed = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: seed.memberId } });
      const res = await itemPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed.collectionId}/items/${seed.itemBId}`, {
          name: "Curator Updated Name",
          brand: "TestBrand",
          color: "Red",
        }),
        { params: Promise.resolve({ id: seed.collectionId, itemId: seed.itemBId }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("Curator Updated Name");
      expect(body.brand).toBe("TestBrand");
      expect(body.color).toBe("Red");

      // Assert real DB column change
      const { db } = getTestDb();
      const itemRepo = new ItemRepository(db);
      const row = await itemRepo.findById(seed.itemBId);
      expect(row!.name).toBe("Curator Updated Name");
      expect(row!.brand).toBe("TestBrand");
      expect(row!.color).toBe("Red");
    });

    it("owner can update their own item metadata", async () => {
      const seed = await seedFullCollection(ownerId);
      // Owner needs a membership row so requireApiCapability finds them as member-or-owner.
      const { db } = getTestDb();
      const membershipRepo = new MembershipRepository(db);
      await membershipRepo.create({
        collectionId: seed.collectionId,
        userId: ownerId,
        role: "owner",
      });

      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await itemPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed.collectionId}/items/${seed.itemAId}`, {
          name: "Owner Updated",
          notes: "Some notes",
        }),
        { params: Promise.resolve({ id: seed.collectionId, itemId: seed.itemAId }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("Owner Updated");
      expect(body.notes).toBe("Some notes");
    });
  });

  // ==========================================================================
  // POST /api/items
  // ==========================================================================
  describe("POST /api/items", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const seed = await seedFullCollection(ownerId);
      const res = await itemsPost(
        nextReq(
          "POST",
          `http://localhost/api/items?collectionId=${seed.collectionId}`,
          { name: "New Item" },
        ),
      );
      expect(res.status).toBe(401);
    });

    it("returns 400 when collectionId query param is missing", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await itemsPost(
        nextReq("POST", "http://localhost/api/items", { name: "New Item" }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/collectionId/);
    });

    it("creates a real item row in the DB for the owner (items:write = curator)", async () => {
      const seed = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await itemsPost(
        nextReq(
          "POST",
          `http://localhost/api/items?collectionId=${seed.collectionId}`,
          { name: "Created Via Route" },
        ),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.collectionId).toBe(seed.collectionId);
      expect(body.name).toBe("Created Via Route");

      // Assert the real DB row exists
      const { db } = getTestDb();
      const itemRepo = new ItemRepository(db);
      const row = await itemRepo.findById(body.id);
      expect(row).not.toBeNull();
      expect(row!.collectionId).toBe(seed.collectionId);
      expect(row!.name).toBe("Created Via Route");
    });

    it("403s a stranger (authenticated, not a member) — and creates no item", async () => {
      // purses-3al: POST /api/items now gates the query-param collectionId via
      // requireApiCollectionAccess before createItem — a non-member gets 403 and
      // nothing is written into the foreign collection.
      const seed = await seedFullCollection(ownerId);
      const strangerId = await seedUserRow("stranger-items");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      const { db } = getTestDb();
      const before = await new ItemRepository(db).findByCollection(seed.collectionId);

      const res = await itemsPost(
        nextReq(
          "POST",
          `http://localhost/api/items?collectionId=${seed.collectionId}`,
          { name: "Stranger Item" },
        ),
      );
      expect(res.status).toBe(403);
      // No row added to the foreign collection.
      const after = await new ItemRepository(db).findByCollection(seed.collectionId);
      expect(after).toHaveLength(before.length);
    });

    it("returns 400 (zod validation fail) when name is missing — no item created", async () => {
      const { db } = getTestDb();
      const seed = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const before = await new ItemRepository(db).findByCollection(seed.collectionId);
      const res = await itemsPost(
        nextReq(
          "POST",
          `http://localhost/api/items?collectionId=${seed.collectionId}`,
          {}, // no name field — zod requires min(1)
        ),
      );
      // ZodError is now caught by errorResponse and mapped to 400.
      expect(res.status).toBe(400);
      // No row written.
      expect(await new ItemRepository(db).findByCollection(seed.collectionId)).toHaveLength(before.length);
    });
  });
});
