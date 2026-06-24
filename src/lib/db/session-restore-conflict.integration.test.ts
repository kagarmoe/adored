// @vitest-environment node
// 4bhh restore-collision proof: migration 0009 made sessions_active_unique a
// PARTIAL index (deleted_at IS NULL AND status IN ('active','paused')), so a
// set-aside (soft-deleted) session FREES the slot — and a user can start a NEW
// in-progress session in it. Clicking Undo on the old one then tries to
// re-activate it, which would put TWO in-progress sessions in one slot: 23505 on
// sessions_active_unique. Before this fix the restore route had no try/catch, so
// that surfaced as a raw 500. This pins the gentle 409 (slot-aware restore) plus
// the friendly findInProgress pre-check, and that the loser STAYS set aside.
//
// Honest real-DB seam: real POST /api/sessions/[id]/restore handler ->
// SessionController -> SessionRepository -> ephemeral Postgres. Mocks ONLY the two
// true boundaries (auth + getDb). Mirrors session-restore-route's auth-mock shape.
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

import { POST as restoreSessionRoute } from "@/app/api/sessions/[id]/restore/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Build a JSON request the handler reads (restore reads no body, but mirror shape). */
function jsonReq(method: string): Request {
  return new Request("http://localhost/api/sessions/x/restore", {
    method,
    headers: { "content-type": "application/json" },
  });
}

describeDb("POST /api/sessions/[id]/restore slot collision -> 409 (4bhh restore-aware)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  // The CRITICAL case: set aside A (slot frees) -> start B (occupies slot) ->
  // Undo A. Restoring A would collide with B on the partial index. The route must
  // return a gentle 409 (NOT a 500), A must STAY set aside, and B must be untouched.
  it("409s (NOT 500) restoring a set-aside session whose slot a NEWER one now holds — A stays set aside, B unchanged", async () => {
    const { db } = getTestDb();
    const repo = new SessionRepository(db);
    const collectionId = await seedBareCollection(ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Set aside A: soft-delete frees the partial-index slot.
    const a = await repo.create({ collectionId, curatorId: ownerId });
    await repo.softDelete(a.id);
    // Start B in the now-free slot.
    const b = await repo.create({ collectionId, curatorId: ownerId });

    const res = await restoreSessionRoute(jsonReq("POST") as any, {
      params: { id: a.id },
    } as any);
    expect(res.status).toBe(409); // was a raw 500 before the slot-aware restore
    const body = await res.json();
    expect(body.error).toMatch(/already have a sort in progress/i);

    // A STAYS set aside: not reactivated.
    const aAfter = await repo.findByIdIncludingDeleted(a.id);
    expect(aAfter).not.toBeNull();
    expect(aAfter!.deletedAt ?? null).not.toBeNull();
    // B unchanged: still the only LIVE session, still in-progress.
    const live = await repo.findByCollection(collectionId);
    expect(live).toHaveLength(1);
    expect(live[0]!.id).toBe(b.id);
    expect(await repo.findInProgress(collectionId, ownerId)).toMatchObject({ id: b.id });
  });

  // Happy path: nothing else holds the slot, so restore re-activates A (200).
  it("200s restoring a set-aside session when the slot is free", async () => {
    const { db } = getTestDb();
    const repo = new SessionRepository(db);
    const collectionId = await seedBareCollection(ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const a = await repo.create({ collectionId, curatorId: ownerId });
    await repo.softDelete(a.id);
    expect(await repo.findById(a.id)).toBeNull(); // gone from the active view

    const res = await restoreSessionRoute(jsonReq("POST") as any, {
      params: { id: a.id },
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(a.id);
    expect(body.deletedAt ?? null).toBeNull();

    const restored = await repo.findById(a.id);
    expect(restored).not.toBeNull();
    expect(restored!.deletedAt ?? null).toBeNull();
    expect(restored!.status).toBe("active");
  });

  // findInProgress: the pre-check's eyes. It must see a PAUSED holder (findActive
  // would miss it), and see nothing when only terminal/deleted rows remain.
  it("findInProgress returns a PAUSED session and null when only terminal/deleted rows exist", async () => {
    const { db } = getTestDb();
    const repo = new SessionRepository(db);
    const collectionId = await seedBareCollection(ownerId);

    // Paused: in-progress per the partial predicate, but invisible to findActive.
    const paused = await repo.create({ collectionId, curatorId: ownerId });
    await repo.update(paused.id, { status: "paused" });
    expect(await repo.findActive(collectionId, ownerId)).toBeNull();
    expect(await repo.findInProgress(collectionId, ownerId)).toMatchObject({
      id: paused.id,
      status: "paused",
    });

    // Now terminal it and add a soft-deleted row: neither holds the slot.
    await repo.update(paused.id, { status: "completed" });
    const setAside = await repo.create({ collectionId, curatorId: ownerId });
    await repo.softDelete(setAside.id);
    expect(await repo.findInProgress(collectionId, ownerId)).toBeNull();
  });
});
