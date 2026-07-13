// @vitest-environment node
// Whole-branch review fix A — the THIRD in-progress writer. After migration 0009
// sessions_active_unique is PARTIAL (deleted_at IS NULL AND status IN
// ('active','paused')). create() and restore() already catch the 23505 -> gentle
// 409. But update() via PATCH /api/sessions/[id] {status} was a BARE UPDATE with
// no catch: PATCH A -> completed frees the slot, create B holds it, PATCH A ->
// active re-enters the partial predicate while B holds it -> 23505 -> the route's
// errorResponse mapped the unknown Error to a RAW 500 (not the gentle 409). This
// pins the 409: A stays completed, B unchanged.
//
// Honest real-DB seam: real PATCH handler -> SessionController -> SessionRepository
// -> ephemeral Postgres. Mocks ONLY the two true boundaries (auth + getDb).
// Mirrors session-restore-conflict's auth-mock shape.
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

import { PATCH as patchSessionRoute } from "@/app/api/sessions/[id]/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Build a JSON PATCH request the handler reads. */
function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/sessions/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describeDb("PATCH /api/sessions/[id] slot collision -> 409 (whole-branch review — third writer)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  // The CRITICAL case: PATCH A -> completed (frees slot) -> create B (holds slot)
  // -> PATCH A -> active. Re-activating A would put TWO in-progress sessions in the
  // slot. The route must return a gentle 409 (NOT a raw 500), A must STAY completed,
  // and B must be untouched.
  it("409s (NOT 500) re-activating a completed session whose slot a NEWER one now holds — A stays completed, B unchanged", async () => {
    const { db } = getTestDb();
    const repo = new SessionRepository(db);
    const collectionId = await seedBareCollection(ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // A: complete it -> terminal rows free the partial-index slot.
    const a = await repo.create({ collectionId, curatorId: ownerId });
    await repo.update(a.id, { status: "completed" });
    // B: starts in the now-free slot.
    const b = await repo.create({ collectionId, curatorId: ownerId });

    // PATCH A back to active -> would collide with B on the partial index.
    const res = await patchSessionRoute(patchReq({ status: "active" }) as any, {
      params: Promise.resolve({ id: a.id }),
    } as any);
    expect(res.status).toBe(409); // was a raw 500 before the update() catch
    const body = await res.json();
    expect(body.error).toMatch(/already have a sort in progress/i);

    // A STAYS completed: the losing UPDATE left it untouched.
    const aAfter = await repo.findByIdIncludingDeleted(a.id);
    expect(aAfter).not.toBeNull();
    expect(aAfter!.status).toBe("completed");
    // B unchanged: still the only in-progress session in the slot.
    expect(await repo.findInProgress(collectionId, ownerId)).toMatchObject({ id: b.id });
  });

  // Same collision via PATCH -> paused (paused is in the partial predicate too).
  it("409s re-activating a completed session to PAUSED while a newer in-progress one holds the slot", async () => {
    const { db } = getTestDb();
    const repo = new SessionRepository(db);
    const collectionId = await seedBareCollection(ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const a = await repo.create({ collectionId, curatorId: ownerId });
    await repo.update(a.id, { status: "completed" });
    await repo.create({ collectionId, curatorId: ownerId }); // B holds the slot

    const res = await patchSessionRoute(patchReq({ status: "paused" }) as any, {
      params: Promise.resolve({ id: a.id }),
    } as any);
    expect(res.status).toBe(409);
  });

  // No collision: PATCH a status change while nothing else holds the slot succeeds.
  it("200s a status PATCH when the slot is free (no collision -> no false 409)", async () => {
    const { db } = getTestDb();
    const repo = new SessionRepository(db);
    const collectionId = await seedBareCollection(ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const a = await repo.create({ collectionId, curatorId: ownerId });
    const res = await patchSessionRoute(patchReq({ status: "paused" }) as any, {
      params: Promise.resolve({ id: a.id }),
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("paused");
  });
});
