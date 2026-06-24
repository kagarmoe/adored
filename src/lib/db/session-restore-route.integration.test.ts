// @vitest-environment node
// Honest real-DB integration for the restore route: real POST
// /api/sessions/[id]/restore handler -> SessionController -> SessionRepository ->
// ephemeral Postgres. Mocks ONLY the two true boundaries: auth (so we can drive
// curator A / co-member B / stranger) and getDb -> the test db. Restore touches no
// blob store, so no @vercel/blob mock.
//
// SECURITY (purses-t9l, the heart of this route): restore resolves the session
// INCLUDING soft-deleted (the active GET/PATCH/DELETE 404 on soft-deleted rows, so
// restore needs its own resolver). The authz order mirrors authorizeSession:
//   401 no auth -> 404 truly absent -> collection gate (404/403) -> curator gate (403)
//   -> restore.
// The IDOR that this route closes: a DIFFERENT curator who IS a member of A's shared
// collection must NOT be able to restore A's set-aside session. The collection gate
// passes B (B is a member), so ONLY the curatorId !== userId check stops B (403). Every
// "stays deleted" assertion is paired with findById, which filters soft-deleted rows:
// null after a denied restore proves the row was NOT reactivated.
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

import { POST as restoreSessionRoute } from "@/app/api/sessions/[id]/restore/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Build a JSON request the handler reads (restore reads no body, but mirror shape). */
function jsonReq(method: string): Request {
  return new Request("http://localhost/api/sessions/x/restore", {
    method,
    headers: { "content-type": "application/json" },
  });
}

/** Add a distinct curator-role member to a collection; returns their user id. */
async function addMember(collectionId: string): Promise<string> {
  const { db } = getTestDb();
  const memberId = await seedUserRow("member");
  await new MembershipRepository(db).create({
    collectionId,
    userId: memberId,
    role: "curator",
  });
  return memberId;
}

describeDb("POST /api/sessions/[id]/restore (route -> repo -> DB) — purses-t9l IDOR", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  /** Seed a bare collection + a session whose curator is `curatorId`. */
  async function seedSession(curatorId: string) {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const session = await new SessionRepository(db).create({ collectionId, curatorId });
    return { collectionId, sessionId: session.id };
  }

  /** Soft-delete a session via the repo and assert it is gone from the active view. */
  async function softDelete(sessionId: string) {
    const { db } = getTestDb();
    await new SessionRepository(db).softDelete(sessionId);
    // Present-before -> gone-after pairing: findById filters soft-deleted rows.
    expect(await new SessionRepository(db).findById(sessionId)).toBeNull();
  }

  // (a) Happy path: the curator restores their own set-aside session.
  it("200s for the curator and re-activates the session (deletedAt cleared, findById finds it)", async () => {
    const { db } = getTestDb();
    const { sessionId } = await seedSession(ownerId);
    await softDelete(sessionId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await restoreSessionRoute(jsonReq("POST") as any, {
      params: { id: sessionId },
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(sessionId);
    expect(body.deletedAt ?? null).toBeNull();

    // Active again: findById (which filters soft-deleted rows) now finds it.
    const restored = await new SessionRepository(db).findById(sessionId);
    expect(restored).not.toBeNull();
    expect(restored!.deletedAt ?? null).toBeNull();
  });

  // (b) IDOR — the critical case. A co-curator-member of the SAME shared collection
  // passes the collection gate but MUST be stopped by the curator gate (403), and the
  // session must STAY soft-deleted.
  it("403s a co-member curator (NOT the session's curator) — and the session STAYS set aside", async () => {
    const { db } = getTestDb();
    const { collectionId, sessionId } = await seedSession(ownerId);
    await softDelete(sessionId);
    const memberId = await addMember(collectionId);
    mockGetSession.mockResolvedValue({ user: { id: memberId } });

    const res = await restoreSessionRoute(jsonReq("POST") as any, {
      params: { id: sessionId },
    } as any);
    expect(res.status).toBe(403);

    // STILL soft-deleted: a denied restore must not reactivate the row.
    expect(await new SessionRepository(db).findById(sessionId)).toBeNull();
    // And it really still exists as a soft-deleted row (not vacuously absent).
    expect(await new SessionRepository(db).findByIdIncludingDeleted(sessionId)).not.toBeNull();
  });

  // (c) A stranger (non-member of the collection) — the collection gate denies them
  // (403 or 404, whichever requireApiCollectionAccess yields), and no restore happens.
  it("denies a non-member (collection gate) — and does NOT restore", async () => {
    const { db } = getTestDb();
    const { sessionId } = await seedSession(ownerId);
    await softDelete(sessionId);
    const strangerId = await seedUserRow("stranger");
    mockGetSession.mockResolvedValue({ user: { id: strangerId } });

    const res = await restoreSessionRoute(jsonReq("POST") as any, {
      params: { id: sessionId },
    } as any);
    expect([403, 404]).toContain(res.status);

    // STILL soft-deleted.
    expect(await new SessionRepository(db).findById(sessionId)).toBeNull();
    expect(await new SessionRepository(db).findByIdIncludingDeleted(sessionId)).not.toBeNull();
  });

  // (d) A truly absent session id -> 404 (distinct from a DB error, which propagates).
  it("404s an absent session id", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await restoreSessionRoute(jsonReq("POST") as any, {
      params: { id: "sess-absent" },
    } as any);
    expect(res.status).toBe(404);
  });

  // (e) No auth -> 401, before any lookup.
  it("401s an unauthenticated caller — and does NOT restore", async () => {
    const { db } = getTestDb();
    const { sessionId } = await seedSession(ownerId);
    await softDelete(sessionId);
    mockGetSession.mockResolvedValue(null);

    const res = await restoreSessionRoute(jsonReq("POST") as any, {
      params: { id: sessionId },
    } as any);
    expect(res.status).toBe(401);

    // STILL soft-deleted.
    expect(await new SessionRepository(db).findById(sessionId)).toBeNull();
    expect(await new SessionRepository(db).findByIdIncludingDeleted(sessionId)).not.toBeNull();
  });
});
