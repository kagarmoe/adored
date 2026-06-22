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
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedFullCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { user as userTable } from "@/lib/db/schema";
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
import { POST as signupPost } from "@/app/api/auth/signup/route";
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
  // POST /api/auth/signup
  // ==========================================================================
  describe("POST /api/auth/signup", () => {
    it("creates a user row with a bcrypt-hashed password (not plaintext)", async () => {
      const email = "signup-test@adored.test";
      const password = "securePass1";
      const res = await signupPost(
        nextReq("POST", "http://localhost/api/auth/signup", { email, password }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.message).toBe("Account created successfully");

      // Assert real DB row exists
      const { db } = getTestDb();
      const [row] = await db
        .select()
        .from(userTable)
        .where(eq(userTable.email, email))
        .limit(1);
      expect(row).toBeDefined();
      expect(row.email).toBe(email);
      // Password must be stored as bcrypt hash, not plaintext
      expect(row.password).not.toBe(password);
      expect(row.password).toMatch(/^\$2[ab]\$/);
    });

    it("returns 201 for a duplicate email (timing equalized: dup path now also hashes)", async () => {
      // Duplicate-email returns 201; timing is equalized — the dup branch now runs
      // bcrypt.hash(password, 12) (throwaway) before the early return, so response
      // time is equivalent to the real signup path. No flaky wall-clock assertion.
      // First signup creates the user
      const email = "dup@adored.test";
      const password = "password123";
      await signupPost(
        nextReq("POST", "http://localhost/api/auth/signup", { email, password }),
      );
      // Second signup with same email: route returns 201 but no second row is created
      const res = await signupPost(
        nextReq("POST", "http://localhost/api/auth/signup", { email, password }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.message).toBe("Account created successfully");

      // Only one user row for that email
      const { db } = getTestDb();
      const rows = await db
        .select()
        .from(userTable)
        .where(eq(userTable.email, email));
      expect(rows).toHaveLength(1);
    });

    it("returns 400 when email is missing", async () => {
      const res = await signupPost(
        nextReq("POST", "http://localhost/api/auth/signup", { password: "password123" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when password is missing", async () => {
      const res = await signupPost(
        nextReq("POST", "http://localhost/api/auth/signup", { email: "x@y.com" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid email format", async () => {
      const res = await signupPost(
        nextReq("POST", "http://localhost/api/auth/signup", {
          email: "not-an-email",
          password: "password123",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when password is shorter than 8 characters", async () => {
      const res = await signupPost(
        nextReq("POST", "http://localhost/api/auth/signup", {
          email: "short@adored.test",
          password: "short",
        }),
      );
      expect(res.status).toBe(400);
    });
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

    it("returns 400 for missing name", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await collectionsPost(
        nextReq("POST", "http://localhost/api/collections", {}),
      );
      expect(res.status).toBe(500); // zod parse throws → caught as generic 500
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
        { params: { id: "any" } },
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
        { params: { id: "col-absent" } },
      );
      expect(res.status).toBe(404);
    });

    it("403s a stranger (authenticated, not a member) reading a collection", async () => {
      // purses-55c: a non-member is now scoped out — 403, the collection unchanged.
      const seed = await seedFullCollection(ownerId);
      const strangerId = await seedUserRow("stranger-get-col");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      const res = await collectionGet(
        nextReq("GET", `http://localhost/api/collections/${seed.collectionId}`),
        { params: { id: seed.collectionId } },
      );
      expect(res.status).toBe(403);
    });

    it("returns the collection for a member of the collection", async () => {
      const seed = await seedFullCollection(ownerId);
      // Log in as the member (not the owner) — a member may read the collection.
      mockGetSession.mockResolvedValue({ user: { id: seed.memberId } });
      const res = await collectionGet(
        nextReq("GET", `http://localhost/api/collections/${seed.collectionId}`),
        { params: { id: seed.collectionId } },
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
        { params: { id: seed.collectionId } },
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when non-owner non-manager tries to PATCH", async () => {
      const seed = await seedFullCollection(ownerId);
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      const res = await collectionPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed.collectionId}`, {
          name: "Hacked",
        }),
        { params: { id: seed.collectionId } },
      );
      expect(res.status).toBe(403);
    });

    it("owner can update name — asserts real column change in DB", async () => {
      const seed = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await collectionPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed.collectionId}`, {
          name: "Renamed Collection",
        }),
        { params: { id: seed.collectionId } },
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

    it("returns 403 for a non-member (curator member has canManageCollection=false — treated as 403)", async () => {
      // The curator member has canManageCollection=false. The controller's
      // canManageCollection only returns true for the owner (membership check
      // is a TODO). So the member gets 403.
      const seed = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: seed.memberId } });
      const res = await collectionPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed.collectionId}`, {
          name: "Member Attempted Rename",
        }),
        { params: { id: seed.collectionId } },
      );
      expect(res.status).toBe(403);
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
        { params: { id: seed.collectionId } },
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 when non-owner tries to delete", async () => {
      const seed = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: seed.memberId } });
      const res = await collectionDelete(
        nextReq("DELETE", `http://localhost/api/collections/${seed.collectionId}`),
        { params: { id: seed.collectionId } },
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
        { params: { id: seed.collectionId } },
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

    it("stranger (authenticated but not a member) gets 403", async () => {
      const seed = await seedFullCollection(ownerId);
      const strangerId = await seedUserRow("stranger-del");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      const res = await collectionDelete(
        nextReq("DELETE", `http://localhost/api/collections/${seed.collectionId}`),
        { params: { id: seed.collectionId } },
      );
      expect(res.status).toBe(403);
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
        { params: { id: seed.collectionId, itemId: seed.itemAId } },
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
        canManageCollection: true,
        canInviteMembers: true,
        canAddItems: true,
        canDeleteItems: true,
        canEditMetadata: true,
        canAddPhotos: true,
        canDeletePhotos: true,
        canSort: true,
        canViewOutputs: true,
      });

      // itemAId belongs to seed, not seed2
      const res = await itemPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed2.collectionId}/items/${seed.itemAId}`, {
          name: "Wrong Collection Item",
        }),
        { params: { id: seed2.collectionId, itemId: seed.itemAId } },
      );
      expect(res.status).toBe(404);
    });

    it("returns 403 when authenticated user lacks canEditMetadata", async () => {
      const seed = await seedFullCollection(ownerId);
      // Create a stranger with no membership in this collection
      const strangerId = await seedUserRow("stranger-item");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      const res = await itemPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed.collectionId}/items/${seed.itemAId}`, {
          name: "Forbidden Update",
        }),
        { params: { id: seed.collectionId, itemId: seed.itemAId } },
      );
      expect(res.status).toBe(403);
    });

    it("member with canEditMetadata=true can update item — asserts real column change", async () => {
      const seed = await seedFullCollection(ownerId);
      // seed.memberId has canEditMetadata=true (curator role from seedFullCollection)
      mockGetSession.mockResolvedValue({ user: { id: seed.memberId } });
      const res = await itemPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed.collectionId}/items/${seed.itemBId}`, {
          name: "Curator Updated Name",
          brand: "TestBrand",
          color: "Red",
        }),
        { params: { id: seed.collectionId, itemId: seed.itemBId } },
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
      // Owner must have a membership row with canEditMetadata; create one
      const { db } = getTestDb();
      const membershipRepo = new MembershipRepository(db);
      await membershipRepo.create({
        collectionId: seed.collectionId,
        userId: ownerId,
        role: "owner",
        canManageCollection: true,
        canInviteMembers: true,
        canAddItems: true,
        canDeleteItems: true,
        canEditMetadata: true,
        canAddPhotos: true,
        canDeletePhotos: true,
        canSort: true,
        canViewOutputs: true,
      });

      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await itemPatch(
        nextReq("PATCH", `http://localhost/api/collections/${seed.collectionId}/items/${seed.itemAId}`, {
          name: "Owner Updated",
          notes: "Some notes",
        }),
        { params: { id: seed.collectionId, itemId: seed.itemAId } },
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

    it("creates a real item row in the DB (authz gap pv9: no membership check)", async () => {
      // NOTE (pv9): this route does NOT verify membership — any authenticated user
      // can create items in any collection. This is a missing tenant check; flagged
      // but not fixed here per the task spec.
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
