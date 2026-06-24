// @vitest-environment node
// 4bhh root-fix proof: after migration 0009 the sessions_active_unique
// UNIQUE(collection_id, curator_id) index is PARTIAL — it covers ONLY in-progress
// rows (deleted_at IS NULL AND status IN ('active','paused')). So the slot is held
// by an active OR paused session; terminal (completed/abandoned) and soft-deleted
// (set-aside) rows FREE the slot, and a fresh create into that freed slot succeeds.
// A second create while an in-progress session still holds the slot collides on
// 23505, which the repo maps to a gentle 409 — NOT a raw 500 — and the losing
// insert leaves no second row behind.
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

describeDb("POST /api/sessions slot conflict — partial sessions_active_unique (4bhh)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("409s (NOT 500) a second create while an ACTIVE session holds the slot — and inserts no second row", async () => {
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

  it("201s a new create after the slot's session is SET ASIDE (soft-deleted) — terminal rows free the slot (purses-4bhh)", async () => {
    const { db } = getTestDb();
    const repo = new SessionRepository(db);
    const collectionId = await seedBareCollection(ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const created = await repo.create({ collectionId, curatorId: ownerId });
    await repo.softDelete(created.id);
    const res = await createSession(jsonReq({ collectionId }) as any);
    expect(res.status).toBe(201);                      // was 409 under the old unconditional index
    expect(await repo.findByCollection(collectionId)).toHaveLength(1); // the new active one
  });

  it("201s a new create after the slot's session is COMPLETED", async () => {
    const { db } = getTestDb();
    const repo = new SessionRepository(db);
    const collectionId = await seedBareCollection(ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const created = await repo.create({ collectionId, curatorId: ownerId });
    await repo.update(created.id, { status: "completed" });
    const res = await createSession(jsonReq({ collectionId }) as any);
    expect(res.status).toBe(201);
  });

  it("201s a new create after the slot's session is ABANDONED", async () => {
    const { db } = getTestDb();
    const repo = new SessionRepository(db);
    const collectionId = await seedBareCollection(ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const created = await repo.create({ collectionId, curatorId: ownerId });
    await repo.update(created.id, { status: "abandoned" });
    const res = await createSession(jsonReq({ collectionId }) as any);
    expect(res.status).toBe(201);
  });

  it("409s a create while a PAUSED session holds the slot (partial predicate includes paused)", async () => {
    const { db } = getTestDb();
    const repo = new SessionRepository(db);
    const collectionId = await seedBareCollection(ownerId);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const created = await repo.create({ collectionId, curatorId: ownerId });
    await repo.update(created.id, { status: "paused" });
    const res = await createSession(jsonReq({ collectionId }) as any);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already have a sort in progress/i);
  });
});
