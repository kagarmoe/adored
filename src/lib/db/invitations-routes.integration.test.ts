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
// AUTHZ GAP NOTICE (purses-nj7):
//   GET / PATCH / DELETE /api/invitations/[id] and POST /api/invitations/[id]/resend
//   perform NO ownership or membership check — any authenticated user can act on
//   any invitation. Tests below pin the ACTUAL current behavior (200/success for a
//   stranger) and are annotated with the gap. These are regression pins, not approvals.
//
//   /api/invitations/accept is intentionally public (no auth required); the gap there
//   is that POST accept does NOT create a membership row — it only flips
//   invitation.status to "accepted". Tests pin this actual behavior.
//
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedUserRow } from "../../../e2e/fixtures/seed";
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

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireAuth: async () => {
    const s = await mockGetSession();
    if (!s?.user) throw new Error("Unauthorized");
    return s.user;
  },
}));

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

/** Seed a bare collection owned by ownerId (no full cascade). */
async function seedBareCollection(ownerId: string): Promise<string> {
  const { db } = getTestDb();
  const { sql } = await import("drizzle-orm");
  const collectionId = generateId("col");
  await db.execute(sql`
    INSERT INTO collections (id, owner_id, name, slug, status, created_at, updated_at)
    VALUES (${collectionId}, ${ownerId}, ${"Test Collection"}, ${`slug-${collectionId}`}, 'active', now(), now())
  `);
  return collectionId;
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

    it("500 for absent invitation (no owner check — invitationController throws 'Invitation not found')", async () => {
      // The route maps all non-Unauthorized errors to 500 (not 404). Pin current behavior.
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await getInvitation(
        makeRequest("GET", "http://localhost/api/invitations/inv-absent") as any,
        { params: { id: "inv-absent" } },
      );
      // The controller throws "Invitation not found"; the route maps it to 500 (not 404).
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toMatch(/not found/i);
    });

    // IDOR GAP (purses-nj7): any authenticated user can read any invitation —
    // the route has no collection ownership / membership check.
    it("IDOR GAP: stranger (authenticated, unrelated user) can read another user's invitation — pins current behavior", async () => {
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      const res = await getInvitation(
        makeRequest("GET", `http://localhost/api/invitations/${id}`) as any,
        { params: { id } },
      );
      // BUG: should be 403. Currently 200 — no authz guard on this route.
      expect(res.status).toBe(200);
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

    it("happy path — updates permission fields; DB row reflects change", async () => {
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
      const body = await res.json();
      expect(body.canSort).toBe(false);
      expect(body.canDeletePhotos).toBe(true);

      // Verify the DB row was actually updated.
      const { db } = getTestDb();
      const updated = await new InvitationRepository(db).findById(id);
      expect(updated).not.toBeNull();
      expect(updated!.canSort).toBe(false);
      expect(updated!.canDeletePhotos).toBe(true);
    });

    it("IDOR GAP: stranger can patch another user's invitation — pins current behavior", async () => {
      const strangerId = await seedUserRow("stranger-patch");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      const res = await patchInvitation(
        makeRequest("PATCH", `http://localhost/api/invitations/${id}`, { canSort: false }) as any,
        { params: { id } },
      );
      // BUG: should be 403. Currently 200 — no authz guard.
      expect(res.status).toBe(200);

      // The mutation actually lands in the DB.
      const { db } = getTestDb();
      const inv = await new InvitationRepository(db).findById(id);
      expect(inv!.canSort).toBe(false);
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

    it("500 for absent invitation (controller throws 'Invitation not found' → route maps to 500)", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await deleteInvitation(
        makeRequest("DELETE", "http://localhost/api/invitations/inv-absent") as any,
        { params: { id: "inv-absent" } },
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toMatch(/not found/i);
    });

    it("IDOR GAP: stranger can revoke another user's invitation — pins current behavior", async () => {
      const strangerId = await seedUserRow("stranger-delete");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      const res = await deleteInvitation(
        makeRequest("DELETE", `http://localhost/api/invitations/${id}`) as any,
        { params: { id } },
      );
      // BUG: should be 403. Currently 200 — no authz guard.
      expect(res.status).toBe(200);

      // The status change actually lands in the DB.
      const { db } = getTestDb();
      const inv = await new InvitationRepository(db).findById(id);
      expect(inv!.status).toBe("revoked");
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

    it("500 for absent invitation (controller throws 'Invitation not found' → route maps to 500)", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await resendInvitation(
        makeRequest("POST", "http://localhost/api/invitations/inv-absent/resend") as any,
        { params: { id: "inv-absent" } },
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toMatch(/not found/i);
    });

    it("IDOR GAP: stranger can resend another user's invitation — pins current behavior", async () => {
      const strangerId = await seedUserRow("stranger-resend");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const collectionId = await seedBareCollection(ownerId);
      const { id } = await seedInvitation(collectionId);

      const res = await resendInvitation(
        makeRequest("POST", `http://localhost/api/invitations/${id}/resend`) as any,
        { params: { id } },
      );
      // BUG: should be 403. Currently 200 — no authz guard.
      expect(res.status).toBe(200);
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
      const req = makeNextRequest("POST", "http://localhost/api/invitations/accept");
      const res = await acceptPost(req as any);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/token is required/i);
    });

    it("404 for an unknown token", async () => {
      const req = makeNextRequest("POST", "http://localhost/api/invitations/accept?token=unknown-tok-999");
      const res = await acceptPost(req as any);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/not found|expired/i);
    });

    it("happy path — marks invitation as 'accepted' in the DB", async () => {
      const collectionId = await seedBareCollection(ownerId);
      const { id, token } = await seedInvitation(collectionId, "acceptee@adored.test");

      const req = makeNextRequest("POST", `http://localhost/api/invitations/accept?token=${token}`);
      const res = await acceptPost(req as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toMatch(/accepted/i);

      // DB state: invitation status = "accepted".
      const { db } = getTestDb();
      const inv = await new InvitationRepository(db).findById(id);
      expect(inv).not.toBeNull();
      expect(inv!.status).toBe("accepted");
    });

    it("no auth required — works without a session (public endpoint)", async () => {
      mockGetSession.mockResolvedValue(null);
      const collectionId = await seedBareCollection(ownerId);
      const { token } = await seedInvitation(collectionId, "pubaccept@adored.test");

      const req = makeNextRequest("POST", `http://localhost/api/invitations/accept?token=${token}`);
      const res = await acceptPost(req as any);
      expect(res.status).toBe(200);
    });

    // ACCEPT GAP: POST accept does NOT create a membership row.
    // The handler only flips invitation.status — the acceptInvitation() controller
    // method is a stub (returns early with a TODO). Tests pin current behavior.
    it("ACCEPT GAP: accepting an invitation does NOT create a membership row — pins current behavior", async () => {
      const collectionId = await seedBareCollection(ownerId);
      const { token } = await seedInvitation(collectionId, "nogap@adored.test");

      const req = makeNextRequest("POST", `http://localhost/api/invitations/accept?token=${token}`);
      const res = await acceptPost(req as any);
      expect(res.status).toBe(200);

      // BUG: a membership row should be created for the invitee. Currently none is.
      const { db } = getTestDb();
      const memberships = await new MembershipRepository(db).findByCollection(collectionId);
      // Zero memberships — no membership was created by the accept flow.
      expect(memberships).toHaveLength(0);
    });

    it("accepting a revoked invitation still succeeds (no status guard) — pins current behavior", async () => {
      // The route performs no status validation — it will 'accept' a revoked invitation.
      const collectionId = await seedBareCollection(ownerId);
      const { id, token } = await seedInvitation(collectionId, "revoked-acceptee@adored.test");

      // Revoke the invitation first.
      const { db } = getTestDb();
      await new InvitationRepository(db).update(id, { status: "revoked" });

      const req = makeNextRequest("POST", `http://localhost/api/invitations/accept?token=${token}`);
      const res = await acceptPost(req as any);
      // BUG: should be 400 or 410 for a revoked invitation. Currently 200.
      expect(res.status).toBe(200);

      // The status is now "accepted" even though it was revoked.
      const inv = await new InvitationRepository(db).findById(id);
      expect(inv!.status).toBe("accepted");
    });
  });
});
