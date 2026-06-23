// Real-DB integration tests for the collection/item lifecycle routes:
//   GET/POST /api/collections/[id]/members
//   POST     /api/collections/[id]/archive
//   POST     /api/collections/[id]/restore
//   POST     /api/items/[id]/restore
//
// Mocks ONLY auth (getSession/requireAuth) and getDb → test DB.
// No @vercel/blob calls in these routes — not mocked.
//
// AUTHZ pv9 (PR4 — all closed; tests below reflect current capability-gated behavior):
//   purses-55c: GET /members is now members:read (curator) — no longer requireAuth-only.
//   purses-3al: POST /items/[id]/restore is now requireApiItemCapability (items:write) — IDOR closed.
//   archive/restore: an absent collection now returns a clean 404 (requireApiCapability
//               resolves-then-authorizes) — was a 403 from canManageCollection → findById null.
// @vitest-environment node

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedFullCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

// ---------------------------------------------------------------------------
// Hoisted mocks — must precede any import that transitively loads @/lib/auth
// ---------------------------------------------------------------------------
const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));

vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

// Import route handlers AFTER mocks are hoisted
import { GET as membersGet, POST as membersPost } from "@/app/api/collections/[id]/members/route";
import { POST as archivePost } from "@/app/api/collections/[id]/archive/route";
import { POST as collectionRestorePost } from "@/app/api/collections/[id]/restore/route";
import { POST as itemRestorePost } from "@/app/api/items/[id]/restore/route";

// ---------------------------------------------------------------------------
// Gate: skip unless RUN_DB_TESTS=1
// ---------------------------------------------------------------------------
const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
function req(method: string, body?: unknown) {
  return new Request("http://localhost/", {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as any;
}

const getReq = () => req("GET");
const postReq = (body?: unknown) => req("POST", body ?? {});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describeDb("lifecycle route integration tests — members + archive/restore", () => {
  let ownerId: string;
  let strangerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
    strangerId = await seedUserRow("stranger");
  });

  afterAll(async () => {
    await closeDb();
  });

  // =========================================================================
  // GET /api/collections/[id]/members
  // =========================================================================
  describe("GET /api/collections/[id]/members", () => {
    it("401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { collectionId } = await seedFullCollection(ownerId);

      const res = await membersGet(getReq(), { params: { id: collectionId } });
      expect(res.status).toBe(401);
    });

    it("happy path — owner gets the membership list (real rows)", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const { collectionId, memberId } = await seedFullCollection(ownerId);

      const res = await membersGet(getReq(), { params: { id: collectionId } });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({ collectionId, userId: memberId });
    });

    it("happy path — member gets the membership list (real rows)", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await membersGet(getReq(), { params: { id: collectionId } });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("403s a stranger listing members of a foreign collection", async () => {
      // purses-55c: GET /members is now scoped to collection access — a non-member
      // gets 403 instead of the full roster.
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      const { collectionId } = await seedFullCollection(ownerId);

      const res = await membersGet(getReq(), { params: { id: collectionId } });
      expect(res.status).toBe(403);
    });

    it("returns empty array for collection with no members", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const collectionId = await seedBareCollection(ownerId);

      const res = await membersGet(getReq(), { params: { id: collectionId } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });
  });

  // =========================================================================
  // POST /api/collections/[id]/members
  // =========================================================================
  describe("POST /api/collections/[id]/members", () => {
    it("401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { collectionId } = await seedFullCollection(ownerId);

      const res = await membersPost(
        postReq({ userId: strangerId }),
        { params: { id: collectionId } },
      );
      expect(res.status).toBe(401);
    });

    it("403 when non-owner (non-manager) tries to add a member", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await membersPost(
        postReq({ userId: strangerId }),
        { params: { id: collectionId } },
      );
      expect(res.status).toBe(403);
    });

    it("403 when stranger tries to add a member", async () => {
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      const { collectionId } = await seedFullCollection(ownerId);

      const res = await membersPost(
        postReq({ userId: strangerId }),
        { params: { id: collectionId } },
      );
      expect(res.status).toBe(403);
    });

    it("happy path — owner adds a new member; real membership row created", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      // Use a collection with no existing members for a clean count
      const collectionId = await seedBareCollection(ownerId);
      const { db } = getTestDb();

      const newUserId = await seedUserRow("new-member");

      const res = await membersPost(
        postReq({ userId: newUserId }),
        { params: { id: collectionId } },
      );
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body).toMatchObject({ collectionId, userId: newUserId });

      // Verify real DB row
      const membershipRepo = new MembershipRepository(db);
      const memberships = await membershipRepo.findByCollection(collectionId);
      expect(memberships).toHaveLength(1);
      expect(memberships[0]).toMatchObject({ collectionId, userId: newUserId, role: "curator" });
    });

    it("400 on invalid JSON body", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const { collectionId } = await seedFullCollection(ownerId);

      // Send raw Request with invalid JSON
      const badReq = new Request("http://localhost/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }) as any;

      const res = await membersPost(badReq, { params: { id: collectionId } });
      expect(res.status).toBe(400);
    });

    it("404s an absent collection (requireApiCapability resolves-then-authorizes)", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await membersPost(
        postReq({ userId: strangerId }),
        { params: { id: "col-absent" } },
      );
      // requireApiCapability → collection not found → 404
      expect(res.status).toBe(404);
    });

    it("owner gets 400 on an invalid body (missing userId) via errorResponse — no member created (purses-pv9)", async () => {
      // addMember CreateMemberSchema.parse()es the body; a missing userId is a
      // ZodError, now mapped to 400 by errorResponse (was 500). The 403 manager
      // guard runs BEFORE addMember, so authz is unchanged.
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const collectionId = await seedBareCollection(ownerId);
      const { db } = getTestDb();
      const before = await new MembershipRepository(db).findByCollection(collectionId);

      const res = await membersPost(
        postReq({}), // no userId
        { params: { id: collectionId } },
      );
      expect(res.status).toBe(400);
      // No membership row was created.
      expect(await new MembershipRepository(db).findByCollection(collectionId)).toHaveLength(before.length);
    });
  });

  // =========================================================================
  // POST /api/collections/[id]/archive
  // =========================================================================
  describe("POST /api/collections/[id]/archive", () => {
    it("401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { collectionId } = await seedFullCollection(ownerId);

      const res = await archivePost(postReq(), { params: { id: collectionId } });
      expect(res.status).toBe(401);
    });

    it("403 when non-owner member tries to archive", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await archivePost(postReq(), { params: { id: collectionId } });
      expect(res.status).toBe(403);
    });

    it("403 when stranger tries to archive", async () => {
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      const { collectionId } = await seedFullCollection(ownerId);

      const res = await archivePost(postReq(), { params: { id: collectionId } });
      expect(res.status).toBe(403);
    });

    it("404s an absent collection (resolve-then-authorize)", async () => {
      // purses-nj7 ride-along: archive resolves the collection first — an absent id is
      // a clean 404 (was a 403 from canManageCollection → findById null → not-manager).
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await archivePost(postReq(), { params: { id: "col-absent" } });
      expect(res.status).toBe(404);
    });

    it("happy path — owner archives; DB status flips to 'archived'", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const { db } = getTestDb();
      const { collectionId } = await seedFullCollection(ownerId);

      // Guard: collection is active before archiving
      const before = await new CollectionRepository(db).findById(collectionId);
      expect(before?.status).toBe("active");

      const res = await archivePost(postReq(), { params: { id: collectionId } });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toMatchObject({ id: collectionId, status: "archived" });

      // Verify real DB row
      const after = await new CollectionRepository(db).findById(collectionId);
      expect(after?.status).toBe("archived");
    });
  });

  // =========================================================================
  // POST /api/collections/[id]/restore
  // =========================================================================
  describe("POST /api/collections/[id]/restore", () => {
    it("401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { collectionId } = await seedFullCollection(ownerId);

      const res = await collectionRestorePost(postReq(), { params: { id: collectionId } });
      expect(res.status).toBe(401);
    });

    it("403 when non-owner member tries to restore", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await collectionRestorePost(postReq(), { params: { id: collectionId } });
      expect(res.status).toBe(403);
    });

    it("403 when stranger tries to restore", async () => {
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      const { collectionId } = await seedFullCollection(ownerId);

      const res = await collectionRestorePost(postReq(), { params: { id: collectionId } });
      expect(res.status).toBe(403);
    });

    it("404s an absent collection (resolve-then-authorize)", async () => {
      // purses-nj7 ride-along: restore resolves the collection first — an absent id is
      // a clean 404 (was a 403 from canManageCollection → findById null → not-manager).
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await collectionRestorePost(postReq(), { params: { id: "col-absent" } });
      expect(res.status).toBe(404);
    });

    it("happy path — owner restores archived collection; DB status flips to 'active'", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const { db } = getTestDb();
      const { collectionId } = await seedFullCollection(ownerId);

      // Archive first
      await new CollectionRepository(db).update(collectionId, { status: "archived" });
      const before = await new CollectionRepository(db).findById(collectionId);
      expect(before?.status).toBe("archived");

      const res = await collectionRestorePost(postReq(), { params: { id: collectionId } });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toMatchObject({ id: collectionId, status: "active" });

      // Verify real DB row
      const after = await new CollectionRepository(db).findById(collectionId);
      expect(after?.status).toBe("active");
    });

    it("archive → restore round-trip; collection returns to 'active'", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const { db } = getTestDb();
      const { collectionId } = await seedFullCollection(ownerId);

      await archivePost(postReq(), { params: { id: collectionId } });
      const archived = await new CollectionRepository(db).findById(collectionId);
      expect(archived?.status).toBe("archived");

      const restoreRes = await collectionRestorePost(postReq(), { params: { id: collectionId } });
      expect(restoreRes.status).toBe(200);

      const restored = await new CollectionRepository(db).findById(collectionId);
      expect(restored?.status).toBe("active");
    });
  });

  // =========================================================================
  // POST /api/items/[id]/restore
  // =========================================================================
  describe("POST /api/items/[id]/restore", () => {
    it("401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { itemAId } = await seedFullCollection(ownerId);

      const res = await itemRestorePost(postReq(), { params: { id: itemAId } });
      expect(res.status).toBe(401);
    });

    it("happy path — owner restores a soft-deleted item; deletedAt cleared", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const { db } = getTestDb();
      const { collectionId } = await seedFullCollection(ownerId);

      // Create and soft-delete an item
      const itemRepo = new ItemRepository(db);
      const item = await itemRepo.create({ collectionId, name: "Restore Me" });
      await itemRepo.softDelete(item.id);

      // Guard: item is soft-deleted
      const deleted = await itemRepo.findByIdIncludingDeleted(item.id);
      expect(deleted?.deletedAt).not.toBeNull();

      const res = await itemRestorePost(postReq(), { params: { id: item.id } });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toMatchObject({ id: item.id, collectionId });
      expect(body.deletedAt).toBeNull();

      // Verify real DB row
      const restored = await itemRepo.findById(item.id); // findById filters deletedAt
      expect(restored).not.toBeNull();
      expect(restored?.deletedAt).toBeNull();
    });

    it("403s a stranger restoring a foreign item — and leaves it soft-deleted", async () => {
      // purses-3al: POST /items/[id]/restore now resolves the item (incl. soft-deleted)
      // and gates on collection access — a non-member gets 403 and the item stays
      // soft-deleted.
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      const { db } = getTestDb();
      const { collectionId } = await seedFullCollection(ownerId);

      const itemRepo = new ItemRepository(db);
      const item = await itemRepo.create({ collectionId, name: "Foreign Item" });
      await itemRepo.softDelete(item.id);

      const res = await itemRestorePost(postReq(), { params: { id: item.id } });
      expect(res.status).toBe(403);

      // Still soft-deleted — the stranger's restore did not take effect.
      expect(await itemRepo.findById(item.id)).toBeNull();
      const stillDeleted = await itemRepo.findByIdIncludingDeleted(item.id);
      expect(stillDeleted?.deletedAt).not.toBeNull();
    });

    it("404s an absent item id (resolve-then-authorize)", async () => {
      // purses-3al: the route resolves the item via findByIdIncludingDeleted first;
      // an absent item is a clean 404 (was a 500 from an UPDATE returning() TypeError).
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await itemRestorePost(postReq(), { params: { id: "item-absent" } });
      expect(res.status).toBe(404);
    });
  });
});
