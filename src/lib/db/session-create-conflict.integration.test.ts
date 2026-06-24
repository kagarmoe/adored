// @vitest-environment node
// 4bhh safety net: the sessions_active_unique UNIQUE(collection_id, curator_id)
// index covers EVERY row of a (collection, curator) slot — active, paused,
// completed, AND soft-deleted (set-aside) — because it has no partial WHERE.
// So a second POST /api/sessions into an occupied slot collides on 23505. The
// repo's create() only retried sessions_collection_number_unique, so the active
// collision (and, worse, the soft-deleted one that findActive can't see) fell
// through to a raw 500. This pins the gentle 409 everywhere, NOT a 500, and that
// the losing insert leaves NO second row behind.
//
// Honest real-DB seam: real POST handler -> SessionController -> SessionRepository
// -> ephemeral Postgres. Mocks ONLY the two true boundaries (auth + getDb).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";

const { mockGetSession, UnauthorizedError } = vi.hoisted(() => {
  class UnauthorizedError extends Error {
    constructor(message = "Unauthorized") { super(message); this.name = "UnauthorizedError"; }
  }
  return { mockGetSession: vi.fn(), UnauthorizedError };
});
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

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function jsonReq(body?: unknown): Request {
  return new Request("http://localhost/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describeDb("POST /api/sessions existing-session conflict -> 409 (4bhh safety net)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("409s (NOT 500) a second create while an ACTIVE session exists — and inserts no second row", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const first = await createSession(jsonReq({ collectionId }) as any);
    expect(first.status).toBe(201);
    expect(await new SessionRepository(db).findByCollection(collectionId)).toHaveLength(1);

    const second = await createSession(jsonReq({ collectionId }) as any);
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toMatch(/already have a sort in progress/i);

    // No second row: still exactly one (the active one), no orphan from the loser.
    expect(await new SessionRepository(db).findByCollection(collectionId)).toHaveLength(1);
  });

  it("409s (NOT 500) a create when a SOFT-DELETED (set-aside) session holds the slot — the gap findActive can't see", async () => {
    const { db } = getTestDb();
    const repo = new SessionRepository(db);
    const collectionId = await seedBareCollection(ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Occupy the (collection, curator) slot, then set it aside (soft-delete).
    const created = await repo.create({ collectionId, curatorId: ownerId });
    await repo.softDelete(created.id);
    // findActive (filters deletedAt) sees nothing — but the row still holds the
    // unique slot, so the unconditional index still collides on insert.
    expect(await repo.findActive(collectionId, ownerId)).toBeNull();

    const res = await createSession(jsonReq({ collectionId }) as any);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already have a sort in progress/i);

    // No NEW row inserted: the only row is the soft-deleted one (findByCollection
    // filters deleted, so it reads 0 live rows — and including-deleted is still 1).
    expect(await repo.findByCollection(collectionId)).toHaveLength(0);
    const all = await db
      .select()
      .from((await import("@/lib/db/schema")).sessionsTable);
    expect(all.filter((r: any) => r.collectionId === collectionId)).toHaveLength(1);
  });
});
