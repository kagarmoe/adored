// @vitest-environment node
// Honest real-DB integration for the sessions routes: real POST /api/sessions and
// real /api/sessions/[id] GET/PATCH/DELETE handlers -> SessionController ->
// SessionRepository -> ephemeral Postgres. Mocks ONLY the two true boundaries:
// auth (so we can drive owner / member / stranger / curator) and getDb -> the test
// db. Sessions routes touch no blob store, so no @vercel/blob mock.
//
// RULE (purses-t9l): sessions are CURATOR-scoped — only session.curatorId may read,
// update, or delete it, even other collection members/owners may not. The collection
// gate (requireApiCollectionAccess) runs first (404 absent collection / 403 outsider),
// then the curator-scope gate (403). Every "gone after" / "unchanged" assertion is
// paired with a "present before" / "non-zero before" read, so a never-seeded row can't
// make the suite vacuously pass.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";

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

import { POST as createSession } from "@/app/api/sessions/route";
import {
  GET as getSession,
  PATCH as patchSession,
  DELETE as deleteSession,
} from "@/app/api/sessions/[id]/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Build a JSON request the handlers read via req.json(). Body omitted => no body. */
function jsonReq(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/sessions/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Add a distinct member (curator role, full sort access) to a collection. */
async function addMember(collectionId: string): Promise<string> {
  const { db } = getTestDb();
  const memberId = await seedUserRow("member");
  await new MembershipRepository(db).create({
    collectionId,
    userId: memberId,
    role: "curator",
    canManageCollection: false,
    canInviteMembers: false,
    canAddItems: true,
    canEditMetadata: true,
    canAddPhotos: true,
    canDeletePhotos: false,
    canSort: true,
    canViewOutputs: true,
  });
  return memberId;
}

describeDb("sessions routes (route -> repo -> DB) — purses-t9l", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  describe("POST /api/sessions", () => {
    it("401s an unauthenticated caller — and creates no session", async () => {
      const collectionId = await seedBareCollection(ownerId);
      mockGetSession.mockResolvedValue(null);

      const res = await createSession(jsonReq("POST", { collectionId }) as any);
      expect(res.status).toBe(401);

      // Non-vacuous: there was a real collection it could have created a session in.
      const { db } = getTestDb();
      expect(await new SessionRepository(db).findByCollection(collectionId)).toHaveLength(0);
    });

    it("400s when collectionId is missing — and creates no session", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await createSession(jsonReq("POST", { goal: "no id" }) as any);
      expect(res.status).toBe(400);
    });

    it("403s a non-member of the collection — and creates no session", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });

      const res = await createSession(jsonReq("POST", { collectionId }) as any);
      expect(res.status).toBe(403);

      // The collection exists but no session was created in it.
      expect(await new SessionRepository(db).findByCollection(collectionId)).toHaveLength(0);
    });

    it("404s an absent collection id", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await createSession(jsonReq("POST", { collectionId: "col-absent" }) as any);
      expect(res.status).toBe(404);
    });

    it("201s for a member and persists a session whose curatorId === caller", async () => {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // Non-vacuous guard: no sessions before the create.
      expect(await new SessionRepository(db).findByCollection(collectionId)).toHaveLength(0);

      const res = await createSession(
        jsonReq("POST", { collectionId, goal: "Find my favorites" }) as any,
      );
      expect(res.status).toBe(201);
      const body = await res.json();

      // The row is real, read back via the repo, and curator-scoped to the caller.
      const persisted = await new SessionRepository(db).findById(body.id);
      expect(persisted).not.toBeNull();
      expect(persisted!.curatorId).toBe(ownerId);
      expect(persisted!.collectionId).toBe(collectionId);
      expect(persisted!.goal).toBe("Find my favorites");
      expect(persisted!.status).toBe("active");
    });
  });

  describe("/api/sessions/[id] GET/PATCH/DELETE", () => {
    /** Seed a bare collection + a session whose curator is `curatorId`. */
    async function seedSession(curatorId: string) {
      const { db } = getTestDb();
      const collectionId = await seedBareCollection(ownerId);
      const session = await new SessionRepository(db).create({ collectionId, curatorId });
      return { collectionId, sessionId: session.id };
    }

    // ---- GET --------------------------------------------------------------
    it("GET 401s an unauthenticated caller", async () => {
      const { sessionId } = await seedSession(ownerId);
      mockGetSession.mockResolvedValue(null);
      const res = await getSession(jsonReq("GET") as any, { params: { id: sessionId } } as any);
      expect(res.status).toBe(401);
    });

    it("GET 404s an absent session id", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await getSession(jsonReq("GET") as any, { params: { id: "sess-absent" } } as any);
      expect(res.status).toBe(404);
    });

    it("GET 403s a collection member who is NOT the session's curator (curator-scope)", async () => {
      const { collectionId, sessionId } = await seedSession(ownerId);
      const memberId = await addMember(collectionId);
      mockGetSession.mockResolvedValue({ user: { id: memberId } });
      const res = await getSession(jsonReq("GET") as any, { params: { id: sessionId } } as any);
      expect(res.status).toBe(403);
    });

    it("GET 403s a non-member entirely (collection gate)", async () => {
      const { sessionId } = await seedSession(ownerId);
      const strangerId = await seedUserRow("stranger");
      mockGetSession.mockResolvedValue({ user: { id: strangerId } });
      const res = await getSession(jsonReq("GET") as any, { params: { id: sessionId } } as any);
      expect(res.status).toBe(403);
    });

    it("GET 200s for the curator and returns the session", async () => {
      const { sessionId } = await seedSession(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await getSession(jsonReq("GET") as any, { params: { id: sessionId } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(sessionId);
      expect(body.curatorId).toBe(ownerId);
    });

    // ---- PATCH ------------------------------------------------------------
    it("PATCH 401s an unauthenticated caller — and does NOT mutate", async () => {
      const { db } = getTestDb();
      const { sessionId } = await seedSession(ownerId);
      mockGetSession.mockResolvedValue(null);
      const res = await patchSession(jsonReq("PATCH", { goal: "hacked" }) as any, {
        params: { id: sessionId },
      } as any);
      expect(res.status).toBe(401);
      // Present-before pairing: the goal is untouched (still null from create()).
      expect((await new SessionRepository(db).findById(sessionId))!.goal).toBeNull();
    });

    it("PATCH 404s an absent session id", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await patchSession(jsonReq("PATCH", { goal: "x" }) as any, {
        params: { id: "sess-absent" },
      } as any);
      expect(res.status).toBe(404);
    });

    it("PATCH 403s a member who is NOT the curator — and leaves the session unchanged", async () => {
      const { db } = getTestDb();
      const { collectionId, sessionId } = await seedSession(ownerId);
      const memberId = await addMember(collectionId);
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await patchSession(jsonReq("PATCH", { status: "abandoned" }) as any, {
        params: { id: sessionId },
      } as any);
      expect(res.status).toBe(403);
      // Unchanged: still active (assert via repo read).
      expect((await new SessionRepository(db).findById(sessionId))!.status).toBe("active");
    });

    it("PATCH 200s for the curator and persists the mutation", async () => {
      const { db } = getTestDb();
      const { sessionId } = await seedSession(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // Present-before guard: starts active with a null goal.
      const before = await new SessionRepository(db).findById(sessionId);
      expect(before!.status).toBe("active");
      expect(before!.goal).toBeNull();

      const res = await patchSession(
        jsonReq("PATCH", { status: "completed", goal: "Done sorting" }) as any,
        { params: { id: sessionId } } as any,
      );
      expect(res.status).toBe(200);

      const after = await new SessionRepository(db).findById(sessionId);
      expect(after!.status).toBe("completed");
      expect(after!.goal).toBe("Done sorting");
    });

    it("PATCH 400s an invalid body (bad status enum) via errorResponse — and does NOT mutate (purses-pv9)", async () => {
      // updateSession UpdateSessionSchema.parse()es the body; an out-of-enum status is
      // a ZodError, now mapped to 400 by errorResponse (was an unhandled 500). The
      // curator-scope guard runs BEFORE updateSession, so authz is unchanged.
      const { db } = getTestDb();
      const { sessionId } = await seedSession(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      // Present-before: still active.
      expect((await new SessionRepository(db).findById(sessionId))!.status).toBe("active");

      const res = await patchSession(
        jsonReq("PATCH", { status: "not-a-status" }) as any,
        { params: { id: sessionId } } as any,
      );
      expect(res.status).toBe(400);
      // Unchanged: still active.
      expect((await new SessionRepository(db).findById(sessionId))!.status).toBe("active");
    });

    // ---- DELETE -----------------------------------------------------------
    it("DELETE 401s an unauthenticated caller — and does NOT delete", async () => {
      const { db } = getTestDb();
      const { sessionId } = await seedSession(ownerId);
      mockGetSession.mockResolvedValue(null);
      const res = await deleteSession(jsonReq("DELETE") as any, {
        params: { id: sessionId },
      } as any);
      expect(res.status).toBe(401);
      // Present-before pairing: still resolvable (not soft-deleted).
      expect(await new SessionRepository(db).findById(sessionId)).not.toBeNull();
    });

    it("DELETE 404s an absent session id", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await deleteSession(jsonReq("DELETE") as any, {
        params: { id: "sess-absent" },
      } as any);
      expect(res.status).toBe(404);
    });

    it("DELETE 403s a member who is NOT the curator — and the session survives", async () => {
      const { db } = getTestDb();
      const { collectionId, sessionId } = await seedSession(ownerId);
      const memberId = await addMember(collectionId);
      mockGetSession.mockResolvedValue({ user: { id: memberId } });

      const res = await deleteSession(jsonReq("DELETE") as any, {
        params: { id: sessionId },
      } as any);
      expect(res.status).toBe(403);
      expect(await new SessionRepository(db).findById(sessionId)).not.toBeNull();
    });

    it("DELETE 200s for the curator and soft-deletes it (present before, gone after)", async () => {
      const { db } = getTestDb();
      const { sessionId } = await seedSession(ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });

      // Present before.
      expect(await new SessionRepository(db).findById(sessionId)).not.toBeNull();

      const res = await deleteSession(jsonReq("DELETE") as any, {
        params: { id: sessionId },
      } as any);
      expect(res.status).toBe(200);

      // Gone after (findById filters soft-deleted rows).
      expect(await new SessionRepository(db).findById(sessionId)).toBeNull();
    });
  });
});
