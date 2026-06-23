// @vitest-environment node
// Honest real-DB integration for the member-management route:
// real GET/DELETE /api/collections/[id]/members/[mid] handlers ->
// requireApiCollectionAccess + MemberController -> MembershipRepository ->
// ephemeral Postgres. Mocks ONLY the two true boundaries: auth (so we can drive
// owner / curator-member / stranger) and getDb -> the test db. This route touches
// no blob store, so no @vercel/blob mock.
//
// PATCH was removed (purses-2wzz): no UI caller; members have no editable fields
// under the role model (UpdateMemberSchema was empty; repo update wrote only updatedAt).
// Next.js returns 405 automatically for the now-unexported PATCH method.
//
// AUTHZ as-implemented (route.ts + collection-access.ts):
//   - GET: 401 unauth; then requireApiCapability("members:read") (curator) -> 404
//     absent collection / 403 outsider; then belongs-to-parent -> 404 if the [mid]
//     membership row's collectionId !== [id]; else 200 returns the membership.
//   - DELETE: 401 unauth; belongs-to-parent 404 (BEFORE the role gate); then
//     requireApiCapability("members:manage") (owner) -> 403; else removeMember.
//
// purses-lgql CLOSED: members:manage = owner (role-derived from ownerId). The
// canManageCollection flag is inert — a curator is always 403 on member management.
//
// Every "unchanged / gone after" assertion is paired with a "present / as-seeded
// before" read via MembershipRepository, so a never-seeded row can't make the suite
// vacuously pass.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedFullCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

const { mockGetSession, UnauthorizedError } = vi.hoisted(() => {
  class UnauthorizedError extends Error {
    constructor(message = "Unauthorized") { super(message); this.name = "UnauthorizedError"; }
  }
  return { mockGetSession: vi.fn(), UnauthorizedError };
});
// Flat-replace BOTH @/lib/auth exports from one spy (spread/importActual pulls nodemailer).
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireAuth: async () => {
    const s = await mockGetSession();
    if (!s?.user) throw new Error("Unauthorized");
    return s.user;
  },
  UnauthorizedError,
}));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { GET, DELETE } from "@/app/api/collections/[id]/members/[mid]/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Build a JSON request the handlers read via req.json(). Body omitted => no body. */
function jsonReq(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/collections/x/members/y", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (id: string, mid: string) => ({ params: { id, mid } }) as any;

describeDb("member-management route (route -> repo -> DB)", () => {
  let ownerId: string;
  let repo: MembershipRepository;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
    repo = new MembershipRepository(getTestDb().db);
  });

  afterAll(async () => {
    await closeDb();
  });

  /** Resolve the membership ROW id for the seeded curator member (seedFullCollection
   *  returns the member's userId, not the membership id). */
  async function memberMembershipId(collectionId: string, memberUserId: string): Promise<string> {
    const m = await repo.findByUser(memberUserId, collectionId);
    if (!m) throw new Error("expected a seeded membership row");
    return m.id;
  }

  // ---- GET ----------------------------------------------------------------
  describe("GET", () => {
    it("401s an unauthenticated caller", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const mid = await memberMembershipId(collectionId, memberId);
      mockGetSession.mockResolvedValue(null);

      const res = await GET(jsonReq("GET") as any, ctx(collectionId, mid));
      expect(res.status).toBe(401);
    });

    it("403s a stranger who is neither member nor owner", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const mid = await memberMembershipId(collectionId, memberId);
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const res = await GET(jsonReq("GET") as any, ctx(collectionId, mid));
      expect(res.status).toBe(403);
    });

    it("404s when the [mid] membership belongs to a DIFFERENT collection (belongs-to-parent)", async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      // A second collection (same owner) with its own member -> a foreign membership row.
      const other = await seedFullCollection(ownerId);
      const foreignMid = await memberMembershipId(other.collectionId, other.memberId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await GET(jsonReq("GET") as any, ctx(collectionId, foreignMid));
      expect(res.status).toBe(404);
    });

    it("404s when the collection itself is absent", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const mid = await memberMembershipId(collectionId, memberId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await GET(jsonReq("GET") as any, ctx("col-absent", mid));
      expect(res.status).toBe(404);
    });

    it("200s for the owner and returns the membership", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const mid = await memberMembershipId(collectionId, memberId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await GET(jsonReq("GET") as any, ctx(collectionId, mid));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(mid);
      expect(body.collectionId).toBe(collectionId);
      expect(body.userId).toBe(memberId);
    });

    it("200s for a fellow curator member (member-or-owner read gate)", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const mid = await memberMembershipId(collectionId, memberId);
      // The curator member reading their OWN membership row.
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await GET(jsonReq("GET") as any, ctx(collectionId, mid));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(mid);
    });
  });

  // PATCH tests removed (purses-2wzz): PATCH export dropped from route.ts.
  // Next.js returns 405 for the unexported method; no handler to test.

  // ---- DELETE -------------------------------------------------------------
  describe("DELETE", () => {
    it("401s an unauthenticated caller — and does NOT remove", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const mid = await memberMembershipId(collectionId, memberId);
      mockGetSession.mockResolvedValue(null);

      const res = await DELETE(jsonReq("DELETE") as any, ctx(collectionId, mid));
      expect(res.status).toBe(401);
      // Present before pairing: still resolvable.
      expect(await repo.findById(mid)).not.toBeNull();
    });

    it("404s when the [mid] membership belongs to a DIFFERENT collection — and does NOT remove it", async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      const other = await seedFullCollection(ownerId);
      const foreignMid = await memberMembershipId(other.collectionId, other.memberId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await DELETE(jsonReq("DELETE") as any, ctx(collectionId, foreignMid));
      expect(res.status).toBe(404);
      // The foreign row survives.
      expect(await repo.findById(foreignMid)).not.toBeNull();
    });

    it("403s a curator member (non-owner) — and the membership survives", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const mid = await memberMembershipId(collectionId, memberId);
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await DELETE(jsonReq("DELETE") as any, ctx(collectionId, mid));
      expect(res.status).toBe(403);
      expect(await repo.findById(mid)).not.toBeNull();
    });

    it("200s for the owner and removes the membership (present before, gone after)", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const mid = await memberMembershipId(collectionId, memberId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // Present before.
      expect(await repo.findById(mid)).not.toBeNull();

      const res = await DELETE(jsonReq("DELETE") as any, ctx(collectionId, mid));
      expect(res.status).toBe(200);

      // Gone after.
      expect(await repo.findById(mid)).toBeNull();
    });
  });
});
