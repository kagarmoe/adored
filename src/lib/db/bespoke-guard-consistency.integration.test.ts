/**
 * Bespoke curator-private guard consistency (purses-j9qf Task 3).
 *
 * Two guards hand-roll the same 404-before-403 + `curatorId === userId` sequence
 * OUTSIDE the CAPABILITIES chokepoint:
 *   - requireApiResultAccess  (src/server/dal/collection-access.ts) — sort results
 *   - authorizeSession        (inline in src/app/api/sessions/[id]/route.ts) — sessions
 *
 * Pieces of each are already exercised elsewhere (the enumeration test hits the
 * stranger leg through the routes; sort-results-authz + sessions-routes cover the
 * curator leg). This file makes the FULL invariant for each guard explicit and
 * co-located, so a future edit that drops the curator leg or reorders 404-vs-403
 * is caught here directly. One focused test per guard asserts all three legs:
 *
 *   absent resource                → 404
 *   authenticated stranger         → 403 or 404 (never 500, never 200)
 *   member-but-NOT-owning-curator  → 403
 *
 * authorizeSession is not exported, so it is exercised through the real GET
 * /api/sessions/[id] handler (the thinnest export over it).
 *
 * Gated: RUN_DB_TESTS=1.
 * @vitest-environment node
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedUserRow } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireAuth: async () => {
    const s = await mockGetSession();
    if (!s?.user) throw new Error("Unauthorized");
    return s.user;
  },
}));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { requireApiResultAccess } from "@/server/dal/collection-access";
import { GET as getSessionRoute } from "@/app/api/sessions/[id]/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** A bare collection owned by ownerId. */
async function seedCollection(ownerId: string): Promise<string> {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  await db.execute(sql`
    INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
    VALUES (${collectionId}, ${ownerId}, 'Bespoke guard', 'active', now(), now())
  `);
  return collectionId;
}

/** Add a curator member (distinct from the owner) to a collection. */
async function addCurator(collectionId: string): Promise<string> {
  const memberId = await seedUserRow("bespoke-member");
  const { db } = getTestDb();
  await new MembershipRepository(db).create({
    collectionId,
    userId: memberId,
    role: "curator",
  });
  return memberId;
}

const statusOf = (out: unknown): number => (out as Response).status;

describeDb("bespoke curator-private guards — consistency (purses-j9qf Task 3)", () => {
  let ownerId: string;
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });
  afterAll(async () => {
    await closeDb();
  });

  it("requireApiResultAccess: absent→404, stranger→403/404, member-not-curator→403", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const result = await new SortResultRepository(db).create({
      collectionId,
      curatorId: ownerId,
      name: "R",
      status: "draft",
    });

    // absent resource → 404 (resolves before any authz).
    const absent = await requireApiResultAccess(db, "res_does_not_exist", ownerId);
    expect(absent).toBeInstanceOf(NextResponse);
    expect(statusOf(absent)).toBe(404);

    // authenticated stranger (no membership) → 403 or 404, never 500/200.
    const strangerId = await seedUserRow("bespoke-stranger");
    const stranger = await requireApiResultAccess(db, result.id, strangerId);
    expect(stranger).toBeInstanceOf(NextResponse);
    expect([403, 404]).toContain(statusOf(stranger));

    // member of the collection but NOT the result's curator → 403 (curator-scope).
    const memberId = await addCurator(collectionId);
    const member = await requireApiResultAccess(db, result.id, memberId);
    expect(member).toBeInstanceOf(NextResponse);
    expect(statusOf(member)).toBe(403);

    // Positive control: the owning curator resolves the result (guard returns it, not a Response).
    const ok = await requireApiResultAccess(db, result.id, ownerId);
    expect(ok).not.toBeInstanceOf(NextResponse);
    expect((ok as { id: string }).id).toBe(result.id);
  });

  it("authorizeSession (via GET /api/sessions/[id]): absent→404, stranger→403/404, member-not-curator→403", async () => {
    const { db } = getTestDb();
    const collectionId = await seedCollection(ownerId);
    const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });

    const call = (userId: string, sessionId: string) => {
      mockGetSession.mockResolvedValue({ user: { id: userId } });
      const req = new NextRequest(`http://localhost/api/sessions/${sessionId}`);
      return getSessionRoute(req, { params: { id: sessionId } });
    };

    // absent session → 404.
    expect((await call(ownerId, "ses_does_not_exist")).status).toBe(404);

    // authenticated stranger (non-member) → 403 or 404, never 500/200.
    const strangerId = await seedUserRow("bespoke-stranger");
    expect([403, 404]).toContain((await call(strangerId, session.id)).status);

    // member of the collection but NOT the session's curator → 403 (curator-scope).
    const memberId = await addCurator(collectionId);
    expect((await call(memberId, session.id)).status).toBe(403);

    // Positive control: the owning curator gets 200.
    expect((await call(ownerId, session.id)).status).toBe(200);
  });
});
