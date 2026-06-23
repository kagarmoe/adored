// @vitest-environment node
// Honest real-DB integration for the member-management route:
// real GET/PATCH/DELETE /api/collections/[id]/members/[mid] handlers ->
// requireApiCollectionAccess + MemberController -> MembershipRepository ->
// ephemeral Postgres. Mocks ONLY the two true boundaries: auth (so we can drive
// owner / curator-member / stranger) and getDb -> the test db. This route touches
// no blob store, so no @vercel/blob mock.
//
// AUTHZ as-implemented (route.ts + collection-access.ts):
//   - GET: 401 unauth; then requireApiCapability("members:read") (curator) -> 404
//     absent collection / 403 outsider; then belongs-to-parent -> 404 if the [mid]
//     membership row's collectionId !== [id]; else 200 returns the membership.
//   - PATCH: 401 unauth; 400 invalid JSON; belongs-to-parent 404 (runs BEFORE the
//     role gate); then requireApiCapability("members:manage") (owner) -> 403; else updateMember.
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

import { GET, PATCH, DELETE } from "@/app/api/collections/[id]/members/[mid]/route";

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

  // ---- PATCH --------------------------------------------------------------
  describe("PATCH", () => {
    it("401s an unauthenticated caller — and does NOT mutate", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const mid = await memberMembershipId(collectionId, memberId);
      mockGetSession.mockResolvedValue(null);

      const res = await PATCH(jsonReq("PATCH", { canManageCollection: true }) as any, ctx(collectionId, mid));
      expect(res.status).toBe(401);
      // As-seeded before pairing: still false (seedFullCollection sets canManageCollection=false).
      expect((await repo.findById(mid))!.canManageCollection).toBe(false);
    });

    it("400s on an invalid JSON body — and does NOT mutate", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const mid = await memberMembershipId(collectionId, memberId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const badReq = new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{not json",
      });
      const res = await PATCH(badReq as any, ctx(collectionId, mid));
      expect(res.status).toBe(400);
      expect((await repo.findById(mid))!.canAddItems).toBe(true); // untouched (seeded true)
    });

    it("404s when the [mid] membership belongs to a DIFFERENT collection — and does NOT mutate it", async () => {
      const { collectionId } = await seedFullCollection(ownerId);
      const other = await seedFullCollection(ownerId);
      const foreignMid = await memberMembershipId(other.collectionId, other.memberId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await PATCH(jsonReq("PATCH", { canManageCollection: true }) as any, ctx(collectionId, foreignMid));
      expect(res.status).toBe(404);
      // The foreign row is untouched (belongs-to-parent runs before any mutation).
      expect((await repo.findById(foreignMid))!.canManageCollection).toBe(false);
    });

    it("403s a curator member (non-owner) — and leaves the target membership unchanged", async () => {
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const mid = await memberMembershipId(collectionId, memberId);
      // The curator member tries to grant THEMSELVES manage rights.
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await PATCH(jsonReq("PATCH", { canManageCollection: true }) as any, ctx(collectionId, mid));
      expect(res.status).toBe(403);
      expect((await repo.findById(mid))!.canManageCollection).toBe(false);
    });

    it("403s a member WITH canManageCollection=true (members:manage = owner by role, flag is inert — purses-lgql)", async () => {
      // members:manage requires "owner" role derived from collection.ownerId — the
      // canManageCollection flag is inert. A curator is always 403 on member management.
      const { collectionId } = await seedFullCollection(ownerId);
      // A member of THIS collection explicitly granted canManageCollection.
      const managerUserId = await seedUserRow("manager");
      await repo.create({
        collectionId,
        userId: managerUserId,
        role: "curator",
        canManageCollection: true,
        canInviteMembers: false,
        canAddItems: false,
        canEditMetadata: false,
        canAddPhotos: false,
        canDeletePhotos: false,
        canSort: false,
        canViewOutputs: false,
      });
      // A separate target membership in the SAME collection the "manager" tries to edit.
      const targetUserId = await seedUserRow("target");
      const targetMembership = await repo.create({
        collectionId,
        userId: targetUserId,
        role: "curator",
        canManageCollection: false,
        canInviteMembers: false,
        canAddItems: false,
        canEditMetadata: false,
        canAddPhotos: false,
        canDeletePhotos: false,
        canSort: false,
        canViewOutputs: false,
      });
      mockGetSession.mockResolvedValue({ user: { id: managerUserId } });

      const res = await PATCH(jsonReq("PATCH", { canAddItems: true }) as any, ctx(collectionId, targetMembership.id));
      expect(res.status).toBe(403);
      // Unchanged: the flag the would-be manager tried to set never persisted.
      expect((await repo.findById(targetMembership.id))!.canAddItems).toBe(false);
    });

    it("200s for the owner — flags are no longer mutable via PATCH (T1: allow-list is empty)", async () => {
      // After T1: UpdateMemberSchema is z.object({}) — all flag fields stripped.
      // MembershipRepository.update() allow-list only writes updatedAt.
      // PATCH returns 200 but flags remain unchanged.
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const mid = await memberMembershipId(collectionId, memberId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // As-seeded before guard — flags are at their seeded values.
      const before = await repo.findById(mid);
      expect(before!.canManageCollection).toBe(false);
      expect(before!.canDeletePhotos).toBe(false);

      const res = await PATCH(
        jsonReq("PATCH", { canManageCollection: true, canDeletePhotos: true }) as any,
        ctx(collectionId, mid),
      );
      expect(res.status).toBe(200);

      // Flags are unchanged — client-supplied values were stripped by schema + repo allow-list.
      const after = await repo.findById(mid);
      expect(after!.canManageCollection).toBe(false);
      expect(after!.canDeletePhotos).toBe(false);
      expect(after!.canAddItems).toBe(true);
    });

    it("owner PATCH with invalid flag type — 200 (unknown keys stripped, no ZodError) (T1: purses-pv9)", async () => {
      // After T1: UpdateMemberSchema is z.object({}) — unknown keys like canManageCollection
      // are stripped silently (not a ZodError). No mutation, returns 200.
      const { collectionId, memberId } = await seedFullCollection(ownerId);
      const mid = await memberMembershipId(collectionId, memberId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      expect((await repo.findById(mid))!.canManageCollection).toBe(false);

      const res = await PATCH(
        jsonReq("PATCH", { canManageCollection: "yes" }) as any,
        ctx(collectionId, mid),
      );
      // Unknown key stripped by empty schema → no ZodError → 200 (nothing written).
      expect(res.status).toBe(200);
      // Flag unchanged.
      expect((await repo.findById(mid))!.canManageCollection).toBe(false);
    });
  });

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
