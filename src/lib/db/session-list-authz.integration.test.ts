// purses-33u: session-LIST GETs leaked ALL curators' sessions to any member.
// RULE — list GETs are curator-scoped (match the already-scoped pages, t9l).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { GET as flatList } from "@/app/api/sessions/route";
import { GET as nestedList } from "@/app/api/collections/[id]/sessions/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("session-list curator scope (route -> DB) — purses-33u", () => {
  let ownerId: string, collectionId: string, memberId: string;
  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
    const { db } = getTestDb();
    collectionId = generateId("col");
    await db.execute(sql`INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'List scope', 'active', now(), now())`);
    memberId = generateId("user");
    await db.insert((await import("@/lib/db/schema")).user).values({ id: memberId, email: `m-${memberId}@adored.test`, name: "M" });
    await new MembershipRepository(db).create({
      collectionId, userId: memberId, role: "curator",
      canManageCollection: false, canInviteMembers: false, canAddItems: true, canEditMetadata: true,
      canAddPhotos: true, canDeletePhotos: false, canSort: true, canViewOutputs: true,
    });
    await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    await new SessionRepository(db).create({ collectionId, curatorId: memberId });
  });
  afterAll(async () => { await closeDb(); });

  it("flat GET /api/sessions returns only the caller's own sessions", async () => {
    mockGetSession.mockResolvedValue({ user: { id: memberId } });
    const res = await flatList(new Request(`http://localhost/api/sessions?collectionId=${collectionId}`) as any);
    expect(res.status).toBe(200);
    const sessions = await res.json();
    expect(sessions).toHaveLength(1);
    expect(sessions.every((s: any) => s.curatorId === memberId)).toBe(true);
  });

  it("nested GET /api/collections/[id]/sessions returns only the caller's own", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await nestedList(new Request("http://localhost/x") as any, { params: { id: collectionId } });
    const sessions = await res.json();
    expect(sessions).toHaveLength(1);
    expect(sessions.every((s: any) => s.curatorId === ownerId)).toBe(true);
  });

  it("flat GET 403s a non-member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await flatList(new Request(`http://localhost/api/sessions?collectionId=${collectionId}`) as any);
    expect(res.status).toBe(403);
  });
});
