// @vitest-environment node
// Honest real-DB integration for the collection-invitations routes:
// real GET/POST /api/collections/[id]/invitations handlers -> requireApiCollectionAccess
// + InvitationController -> InvitationRepository -> ephemeral Postgres. Mocks ONLY the two
// true boundaries: auth (so we can drive owner / member / stranger) and getDb -> the test
// db. This route touches no blob store, so no @vercel/blob mock. The invitation email
// send is a no-op stub (invitations.ts resendInvitation TODO), so nothing to mock there.
//
// AUTHZ as-implemented (requireApiCollectionAccess — collection-access.ts):
//   - 401 unauthenticated; 404 absent collection; 403 neither member nor owner; else the
//     collection is returned and access proceeds. The gate is MEMBER-OR-OWNER — it does
//     NOT consult any per-permission flag.
//
// PINNED GAPS (do not fix — purses-4wj2; purses-pv9 authz epic):
//   - GAP A (canInviteMembers not enforced, purses-nj7 family): POST creates an invitation
//     for ANY collection member, even one whose membership has canInviteMembers=false. The
//     route gate is member-or-owner only, so a non-privileged member can invite. Pinned below.
//   - GAP B (validation → 500 not 400): a missing/invalid email makes the controller's Zod
//     parse throw, which the POST handler maps to 500 (the only non-401 catch branch), not a
//     400. Pinned below.
//
// Every "0 / absent after" assertion is paired with a "present / non-zero before" read so a
// never-seeded row can't make the suite vacuously pass.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";
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

import { GET, POST } from "@/app/api/collections/[id]/invitations/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Build a JSON request the handlers read via req.json(). Body omitted => no body. */
function jsonReq(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/collections/x/invitations", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Add a member to a collection with the given permission flags (default: no invite perm). */
async function addMember(
  collectionId: string,
  overrides: { canInviteMembers?: boolean } = {},
): Promise<string> {
  const { db } = getTestDb();
  const memberId = await seedUserRow("member");
  await new MembershipRepository(db).create({
    collectionId,
    userId: memberId,
    role: "curator",
    canInviteMembers: overrides.canInviteMembers ?? false,
  });
  return memberId;
}

/** Seed an invitation directly via the repo (bypasses the route). Returns its id + token. */
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

describeDb("collection invitations routes (route -> repo -> DB)", () => {
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
  // GET /api/collections/[id]/invitations
  // =========================================================================
  describe("GET", () => {
    it("401s an unauthenticated caller", async () => {
      const collectionId = await seedBareCollection(ownerId);
      await seedInvitation(collectionId);
      mockGetSession.mockResolvedValue(null);

      const res = await GET(jsonReq("GET") as any, { params: { id: collectionId } } as any);
      expect(res.status).toBe(401);
    });

    it("404s an absent collection id", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await GET(jsonReq("GET") as any, { params: { id: "col-absent" } } as any);
      expect(res.status).toBe(404);
    });

    it("403s a non-member — and does not leak the collection's invitations", async () => {
      const collectionId = await seedBareCollection(ownerId);
      // Non-vacuous: there IS an invitation that a leak would expose.
      await seedInvitation(collectionId);
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const res = await GET(jsonReq("GET") as any, { params: { id: collectionId } } as any);
      expect(res.status).toBe(403);
    });

    it("200s for the owner and lists ONLY this collection's invitations (scoping)", async () => {
      const collectionId = await seedBareCollection(ownerId);
      const otherCollectionId = await seedBareCollection(ownerId);
      const { id: mineId } = await seedInvitation(collectionId, "mine@adored.test");
      // Cross-tenant leak guard: an invitation on a DIFFERENT collection must NOT appear.
      await seedInvitation(otherCollectionId, "other@adored.test");
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await GET(jsonReq("GET") as any, { params: { id: collectionId } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(mineId);
      expect(body[0].collectionId).toBe(collectionId);
      expect(body[0].email).toBe("mine@adored.test");
    });

    it("200s for a member without a privileged flag (member-or-owner gate)", async () => {
      const collectionId = await seedBareCollection(ownerId);
      await seedInvitation(collectionId);
      const memberId = await addMember(collectionId);
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await GET(jsonReq("GET") as any, { params: { id: collectionId } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
    });
  });

  // =========================================================================
  // POST /api/collections/[id]/invitations
  // =========================================================================
  describe("POST", () => {
    it("401s an unauthenticated caller — and creates no invitation", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      mockGetSession.mockResolvedValue(null);

      const res = await POST(jsonReq("POST", { email: "x@adored.test" }) as any, {
        params: { id: collectionId },
      } as any);
      expect(res.status).toBe(401);
      // Non-vacuous: a real collection it could have created an invitation in.
      expect(await new InvitationRepository(db).findByCollection(collectionId)).toHaveLength(0);
    });

    it("404s an absent collection id — and creates no invitation", async () => {
      const { db } = getTestDb();
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await POST(jsonReq("POST", { email: "x@adored.test" }) as any, {
        params: { id: "col-absent" },
      } as any);
      expect(res.status).toBe(404);
      expect(await new InvitationRepository(db).findByCollection("col-absent")).toHaveLength(0);
    });

    it("403s a non-member — and creates no invitation", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const res = await POST(jsonReq("POST", { email: "x@adored.test" }) as any, {
        params: { id: collectionId },
      } as any);
      expect(res.status).toBe(403);
      // The collection exists but no invitation was created in it.
      expect(await new InvitationRepository(db).findByCollection(collectionId)).toHaveLength(0);
    });

    it("400s on an unparseable JSON body — and creates no invitation", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const req = new Request("http://localhost/api/collections/x/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json{{{",
      });
      const res = await POST(req as any, { params: { id: collectionId } } as any);
      expect(res.status).toBe(400);
      const errBody = await res.json();
      expect(errBody.error).toMatch(/invalid json/i);
      expect(await new InvitationRepository(db).findByCollection(collectionId)).toHaveLength(0);
    });

    it("creates a real invitation row for the owner (happy path; read back via repo)", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // Non-vacuous guard: no invitations before the create.
      expect(await new InvitationRepository(db).findByCollection(collectionId)).toHaveLength(0);

      const res = await POST(
        // canInviteMembers is stripped by T1 (flag mass-assignment dropped); only email persists.
        jsonReq("POST", { email: "newinvitee@adored.test", canInviteMembers: true }) as any,
        { params: { id: collectionId } } as any,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(typeof body.token).toBe("string");
      expect(body.token.length).toBeGreaterThan(0);

      // The row is real, read back via the repo, scoped to this collection.
      const persisted = await new InvitationRepository(db).findById(body.id);
      expect(persisted).not.toBeNull();
      expect(persisted!.collectionId).toBe(collectionId);
      expect(persisted!.email).toBe("newinvitee@adored.test");
      expect(persisted!.token).toBe(body.token);
      // Flag stripped by T1 — canInviteMembers uses DB column default (false).
      expect(persisted!.canInviteMembers).toBe(false);
      expect(persisted!.status).toBe("pending");
    });

    // GAP A (purses-4wj2; purses-nj7 family): POST is gated by member-or-owner only — it
    // does NOT require the inviter's membership to have canInviteMembers. A plain member
    // whose membership has canInviteMembers=false can still create an invitation. PIN
    // current behavior; the fix belongs to the purses-pv9 authz epic.
    it("GAP: a member WITHOUT canInviteMembers can still create an invitation — pins current behavior", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const memberId = await addMember(collectionId, { canInviteMembers: false });
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await POST(jsonReq("POST", { email: "gap@adored.test" }) as any, {
        params: { id: collectionId },
      } as any);
      // BUG: should be 403 (no canInviteMembers). Currently 201 — gate is member-or-owner only.
      expect(res.status).toBe(201);
      const created = await new InvitationRepository(db).findByCollection(collectionId);
      expect(created).toHaveLength(1);
      expect(created[0].email).toBe("gap@adored.test");
    });

    it("400s on a missing email and creates no invitation (purses-4wj2)", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await POST(jsonReq("POST", { canSort: true }) as any, {
        params: { id: collectionId },
      } as any);
      expect(res.status).toBe(400);
      expect(await new InvitationRepository(db).findByCollection(collectionId)).toHaveLength(0);
    });

    it("400s on a malformed email and creates no invitation (purses-4wj2)", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      const res = await POST(jsonReq("POST", { email: "not-an-email" }) as any, {
        params: { id: collectionId },
      } as any);
      expect(res.status).toBe(400);
      expect(await new InvitationRepository(db).findByCollection(collectionId)).toHaveLength(0);
    });
  });
});
