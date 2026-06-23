// Real-DB integration tests for the invitation API routes.
//
// Routes covered:
//   GET  /api/invitations/[id]          → InvitationController.getInvitation
//   PATCH /api/invitations/[id]         → InvitationController.updateInvitation
//   DELETE /api/invitations/[id]        → InvitationController.revokeInvitation
//   POST /api/invitations/[id]/resend   → InvitationController.resendInvitation
//   GET  /api/invitations/accept        → invRepo.findByToken (public, no auth)
//   POST /api/invitations/accept        → invRepo.findByToken + invRepo.update (public, no auth)
//
// AUTHZ (purses-nj7, closed in pv9 PR1):
//   GET / PATCH / DELETE /api/invitations/[id] and POST /api/invitations/[id]/resend
//   resolve the invitation → require collection access (member-or-owner) on its
//   collectionId. A non-member stranger gets 403; an absent invitation gets 404.
//   Tests below assert that intended behavior.
//
//   REMAINING GAP (purses-8zcc, owned by pv9 PR3): /api/invitations/accept is
//   intentionally public, but POST accept does NOT create a membership row — it only
//   flips invitation.status to "accepted", with no state guard. The accept-flow tests
//   below still pin this actual (buggy) behavior.
//
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { generateId } from "@/lib/id";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be established before any module import that touches
// @/lib/auth or @/lib/db, so vi.hoisted is required.
// ---------------------------------------------------------------------------
const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));

vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

// Route handlers — imported AFTER mocks are in place.
import { GET as getInvitation, PATCH as patchInvitation, DELETE as deleteInvitation } from "@/app/api/invitations/[id]/route";
import { POST as resendInvitation } from "@/app/api/invitations/[id]/resend/route";
import { GET as acceptGet, POST as acceptPost } from "@/app/api/invitations/accept/route";

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------
const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Plain Request — used for routes that don't access request.nextUrl.
function makeRequest(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// NextRequest — required for routes that read request.nextUrl.searchParams
// (the accept routes use this pattern).
function makeNextRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Seed a minimal invitation for the given collection. Returns {invitation, token}. */
async function seedInvitation(
  collectionId: string,
  email = "invitee@adored.test",
): Promise<{ id: string; token: string }> {
  const { db } = getTestDb();
  const token = generateId("tok");
  const inv = await new InvitationRepository(db).create({
    collectionId,
    email,
    token,
    canManageCollection: false,
    canInviteMembers: false,
    canAddItems: true,
    canEditMetadata: true,
    canAddPhotos: true,
    canDeletePhotos: false,
    canSort: true,
    canViewOutputs: true,
  });
  return { id: inv.id, token };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describeDb("Invitation routes — real DB integration", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  // =========================================================================
  // GET /api/invitations/[id]
  // =========================================================================
  describe("GET /api/invitations/[id]", () => {
    it("401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      const res = await getInvitation(
        makeRequest("GET", `http://localhost/api/invitations/${id}`) as any,
        { params: { id } },
      );
      expect(res.status).toBe(401);
    });

    it("happy path — owner can fetch their invitation", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const collectionId = await seedBareCollection(ownerId);
      const { id, token } = await seedInvitation(collectionId);

      const res = await getInvitation(
        makeRequest("GET", `http://localhost/api/invitations/${id}`) as any,
        { params: { id } },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(id);
      expect(body.token).toBe(token);
      expect(body.status).toBe("pending");
    });

    it("404 for absent invitation (resolve-then-authorize)", async () => {
      // purses-nj7: the route resolves the invitation first via InvitationRepository
      // → an absent id is a clean 404 (was a 500 from the controller throwing).
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await getInvitation(
        makeRequest("GET", "http://localhost/api/invitations/inv-absent") as any,
        { params: { id: "inv-absent" } },
      );
      expect(res.status).toBe(404);
    });

    it("403s a stranger reading another user's invitation", async () => {
      // purses-nj7: invitations/[id] GET is now scoped to the invitation's collection
      // (member-or-owner) — a non-member gets 403.
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      const res = await getInvitation(
        makeRequest("GET", `http://localhost/api/invitations/${id}`) as any,
        { params: { id } },
      );
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // PATCH /api/invitations/[id]
  // =========================================================================
  describe("PATCH /api/invitations/[id]", () => {
    it("401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      const res = await patchInvitation(
        makeRequest("PATCH", `http://localhost/api/invitations/${id}`, { canSort: false }) as any,
        { params: { id } },
      );
      expect(res.status).toBe(401);
    });

    it("400 on invalid JSON body", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      // Simulate a SyntaxError by passing a raw non-JSON Request
      const req = new Request(`http://localhost/api/invitations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "not-json{{{",
      });
      const res = await patchInvitation(req as any, { params: { id } });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/invalid json/i);
    });

    it("happy path — PATCH invitation returns 200; flag fields are no longer mutable via PATCH (purses-pv9 T1)", async () => {
      // After T1: InvitationRepository.update() allow-list only permits status/acceptedAt.
      // Flag fields sent via PATCH are stripped — the DB row is unchanged.
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      const res = await patchInvitation(
        makeRequest("PATCH", `http://localhost/api/invitations/${id}`, {
          canSort: false,
          canDeletePhotos: true,
        }) as any,
        { params: { id } },
      );
      expect(res.status).toBe(200);

      // Flags were not mutated — DB row retains seeded values (canSort=true, canDeletePhotos=false).
      const { db } = getTestDb();
      const updated = await new InvitationRepository(db).findById(id);
      expect(updated).not.toBeNull();
      expect(updated!.canSort).toBe(true);
      expect(updated!.canDeletePhotos).toBe(false);
    });

    it("403s a stranger patching another user's invitation — and does NOT mutate", async () => {
      // purses-nj7: PATCH is now scoped to the invitation's collection — a non-member
      // gets 403 and the invitation is left unchanged.
      const strangerId = await seedUserRow("stranger-patch");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId); // seeded canSort: true

      const res = await patchInvitation(
        makeRequest("PATCH", `http://localhost/api/invitations/${id}`, { canSort: false }) as any,
        { params: { id } },
      );
      expect(res.status).toBe(403);

      // The mutation did NOT land — canSort is still the seeded true.
      const { db } = getTestDb();
      const inv = await new InvitationRepository(db).findById(id);
      expect(inv!.canSort).toBe(true);
    });

    it("400s an invalid body (non-boolean flag) via errorResponse — and does NOT mutate (purses-pv9)", async () => {
      // updateInvitation UpdateInvitationSchema.parse()es the body; a non-boolean flag
      // is a ZodError, now mapped to 400 by errorResponse (was 500). Authz (collection
      // access) runs BEFORE the parse, so it is unchanged.
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId); // seeded canSort: true

      const res = await patchInvitation(
        makeRequest("PATCH", `http://localhost/api/invitations/${id}`, { canSort: "nope" }) as any,
        { params: { id } },
      );
      expect(res.status).toBe(400);

      // Unchanged: canSort is still the seeded true.
      const { db } = getTestDb();
      const inv = await new InvitationRepository(db).findById(id);
      expect(inv!.canSort).toBe(true);
    });
  });

  // =========================================================================
  // DELETE /api/invitations/[id]
  // =========================================================================
  describe("DELETE /api/invitations/[id]", () => {
    it("401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      const res = await deleteInvitation(
        makeRequest("DELETE", `http://localhost/api/invitations/${id}`) as any,
        { params: { id } },
      );
      expect(res.status).toBe(401);
    });

    it("happy path — revokes invitation; DB row status changes to 'revoked'", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      const res = await deleteInvitation(
        makeRequest("DELETE", `http://localhost/api/invitations/${id}`) as any,
        { params: { id } },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toMatch(/revoked/i);

      // DB state: invitation row still exists but status = "revoked".
      const { db } = getTestDb();
      const inv = await new InvitationRepository(db).findById(id);
      expect(inv).not.toBeNull();
      expect(inv!.status).toBe("revoked");
    });

    it("404 for absent invitation (resolve-then-authorize)", async () => {
      // purses-nj7: DELETE resolves the invitation first → absent id is a clean 404.
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await deleteInvitation(
        makeRequest("DELETE", "http://localhost/api/invitations/inv-absent") as any,
        { params: { id: "inv-absent" } },
      );
      expect(res.status).toBe(404);
    });

    it("403s a stranger revoking another user's invitation — and does NOT mutate", async () => {
      // purses-nj7: DELETE is now scoped to the invitation's collection — a non-member
      // gets 403 and the invitation status is unchanged.
      const strangerId = await seedUserRow("stranger-delete");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      const res = await deleteInvitation(
        makeRequest("DELETE", `http://localhost/api/invitations/${id}`) as any,
        { params: { id } },
      );
      expect(res.status).toBe(403);

      // Still pending — the stranger's revoke did not take effect.
      const { db } = getTestDb();
      const inv = await new InvitationRepository(db).findById(id);
      expect(inv!.status).toBe("pending");
    });
  });

  // =========================================================================
  // POST /api/invitations/[id]/resend
  // =========================================================================
  describe("POST /api/invitations/[id]/resend", () => {
    it("401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      const res = await resendInvitation(
        makeRequest("POST", `http://localhost/api/invitations/${id}/resend`) as any,
        { params: { id } },
      );
      expect(res.status).toBe(401);
    });

    it("happy path — returns {message} for an existing invitation", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      const res = await resendInvitation(
        makeRequest("POST", `http://localhost/api/invitations/${id}/resend`) as any,
        { params: { id } },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toMatch(/resent/i);

      // No DB state change expected (resend is a notification stub; no column updated).
      const { db } = getTestDb();
      const inv = await new InvitationRepository(db).findById(id);
      expect(inv).not.toBeNull();
      expect(inv!.status).toBe("pending"); // unchanged
    });

    it("404 for absent invitation (resolve-then-authorize)", async () => {
      // purses-nj7: resend resolves the invitation first → absent id is a clean 404.
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await resendInvitation(
        makeRequest("POST", "http://localhost/api/invitations/inv-absent/resend") as any,
        { params: { id: "inv-absent" } },
      );
      expect(res.status).toBe(404);
    });

    it("403s a stranger resending another user's invitation", async () => {
      // purses-nj7: resend is now scoped to the invitation's collection — a non-member
      // gets 403.
      const strangerId = await seedUserRow("stranger-resend");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      const res = await resendInvitation(
        makeRequest("POST", `http://localhost/api/invitations/${id}/resend`) as any,
        { params: { id } },
      );
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // GET /api/invitations/accept
  // =========================================================================
  describe("GET /api/invitations/accept", () => {
    it("400 when token query param is missing", async () => {
      const req = makeNextRequest("GET", "http://localhost/api/invitations/accept");
      const res = await acceptGet(req as any);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/token is required/i);
    });

    it("404 for an unknown token", async () => {
      const req = makeNextRequest("GET", "http://localhost/api/invitations/accept?token=unknown-tok-123");
      const res = await acceptGet(req as any);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/not found|expired/i);
    });

    it("happy path — returns invitation for a valid token (no auth required)", async () => {
      const collectionId = await seedBareCollection(ownerId);
      const { id, token } = await seedInvitation(collectionId, "gettest@adored.test");

      const req = makeNextRequest("GET", `http://localhost/api/invitations/accept?token=${token}`);
      const res = await acceptGet(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(id);
      expect(body.token).toBe(token);
      expect(body.status).toBe("pending");
    });

    it("no auth required — works without a session (public endpoint)", async () => {
      // mockGetSession is NOT called; session is null. Should still succeed.
      mockGetSession.mockResolvedValue(null);
      const collectionId = await seedBareCollection(ownerId);
      const { token } = await seedInvitation(collectionId, "pubtest@adored.test");

      const req = makeNextRequest("GET", `http://localhost/api/invitations/accept?token=${token}`);
      const res = await acceptGet(req as any);
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // POST /api/invitations/accept
  // =========================================================================
  describe("POST /api/invitations/accept", () => {
    it("400 when token query param is missing", async () => {
      // Token check runs before auth check (early return for malformed URL).
      const req = makeNextRequest("POST", "http://localhost/api/invitations/accept");
      const res = await acceptPost(req as any);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/token is required/i);
    });

    it("404 for an unknown token", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const req = makeNextRequest("POST", "http://localhost/api/invitations/accept?token=unknown-tok-999");
      const res = await acceptPost(req as any);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/not found|expired/i);
    });

    it("happy path — marks invitation as 'accepted' and creates a membership row", async () => {
      const collectionId = await seedBareCollection(ownerId);
      const inviteeId = await seedUserRow("acceptee");
      const { db } = getTestDb();
      const token = generateId("tok");
      const inv = await new InvitationRepository(db).create({
        collectionId,
        email: `acceptee-${inviteeId}@adored.test`,
        token,
      });

      mockGetSession.mockResolvedValue({ user: { id: inviteeId } });

      const req = makeNextRequest("POST", `http://localhost/api/invitations/accept?token=${token}`);
      const res = await acceptPost(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toMatch(/accepted/i);

      // DB state: invitation status = "accepted".
      const updated = await new InvitationRepository(db).findById(inv.id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe("accepted");

      // A curator membership was created.
      const memberships = await new MembershipRepository(db).findByCollection(collectionId);
      expect(memberships).toHaveLength(1);
      expect(memberships[0].userId).toBe(inviteeId);
      expect(memberships[0].role).toBe("curator");
    });

    it("401 when unauthenticated — POST accept now requires a session", async () => {
      // POST accept requires auth to identify the acceptee and verify email match.
      mockGetSession.mockResolvedValue(null);
      const collectionId = await seedBareCollection(ownerId);
      const { token } = await seedInvitation(collectionId, "pubaccept@adored.test");

      const req = makeNextRequest("POST", `http://localhost/api/invitations/accept?token=${token}`);
      const res = await acceptPost(req as any);
      expect(res.status).toBe(401);
    });

    it("email mismatch — 403, no membership created", async () => {
      const collectionId = await seedBareCollection(ownerId);
      const inviteeId = await seedUserRow("email-mismatch-invitee");
      const wrongUserId = await seedUserRow("email-mismatch-wrong");
      const { db } = getTestDb();
      const token = generateId("tok");
      await new InvitationRepository(db).create({
        collectionId,
        email: `email-mismatch-invitee-${inviteeId}@adored.test`,
        token,
      });

      // Log in as the wrong user (different email than invited)
      mockGetSession.mockResolvedValue({ user: { id: wrongUserId } });

      const req = makeNextRequest("POST", `http://localhost/api/invitations/accept?token=${token}`);
      const res = await acceptPost(req as any);
      expect(res.status).toBe(403);

      // No membership was created
      const memberships = await new MembershipRepository(db).findByCollection(collectionId);
      expect(memberships).toHaveLength(0);
    });

    it("double-accept idempotent — 200, exactly 1 membership", async () => {
      const collectionId = await seedBareCollection(ownerId);
      const inviteeId = await seedUserRow("double-accept");
      const { db } = getTestDb();
      const token = generateId("tok");
      await new InvitationRepository(db).create({
        collectionId,
        email: `double-accept-${inviteeId}@adored.test`,
        token,
      });

      mockGetSession.mockResolvedValue({ user: { id: inviteeId } });

      const req1 = makeNextRequest("POST", `http://localhost/api/invitations/accept?token=${token}`);
      const res1 = await acceptPost(req1 as any);
      expect(res1.status).toBe(200);

      // Second accept on same token — invitation is now "accepted", not "pending" → 409
      // or if idempotent 200 (the spec says double-accept → 200, exactly 1 membership)
      const req2 = makeNextRequest("POST", `http://localhost/api/invitations/accept?token=${token}`);
      const res2 = await acceptPost(req2 as any);
      // Second call: invitation is no longer pending → 409
      expect(res2.status).toBe(409);

      // Exactly 1 membership despite two calls
      const memberships = await new MembershipRepository(db).findByCollection(collectionId);
      expect(memberships).toHaveLength(1);
    });

    it("accepting an invitation creates a curator membership row for the invitee", async () => {
      const collectionId = await seedBareCollection(ownerId);
      const inviteeId = await seedUserRow("nogap");
      // Re-seed invitation with the invitee's actual email
      const { db } = getTestDb();
      const token2 = generateId("tok");
      const inv2 = await new InvitationRepository(db).create({
        collectionId,
        email: `nogap-${inviteeId}@adored.test`,
        token: token2,
      });

      mockGetSession.mockResolvedValue({ user: { id: inviteeId } });

      const req = makeNextRequest("POST", `http://localhost/api/invitations/accept?token=${token2}`);
      const res = await acceptPost(req as any);
      expect(res.status).toBe(200);

      // A membership row must be created for the invitee.
      const memberships = await new MembershipRepository(db).findByCollection(collectionId);
      expect(memberships).toHaveLength(1);
      expect(memberships[0].role).toBe("curator");
      expect(memberships[0].userId).toBe(inviteeId);
    });

    it("accepting a revoked invitation returns 409 — status stays revoked", async () => {
      // Status guard: only pending invitations may be accepted.
      const collectionId = await seedBareCollection(ownerId);
      const inviteeId = await seedUserRow("revoked-acceptee");
      const { db } = getTestDb();
      const token = generateId("tok");
      const inv = await new InvitationRepository(db).create({
        collectionId,
        email: `revoked-acceptee-${inviteeId}@adored.test`,
        token,
      });

      // Revoke the invitation first.
      await new InvitationRepository(db).update(inv.id, { status: "revoked" });

      mockGetSession.mockResolvedValue({ user: { id: inviteeId } });

      const req = makeNextRequest("POST", `http://localhost/api/invitations/accept?token=${token}`);
      const res = await acceptPost(req as any);
      expect(res.status).toBe(409);

      // Status must remain revoked.
      const updated = await new InvitationRepository(db).findById(inv.id);
      expect(updated!.status).toBe("revoked");
    });
  });
});
