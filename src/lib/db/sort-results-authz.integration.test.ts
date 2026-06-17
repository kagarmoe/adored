// purses-axn: the whole /api/sort-results/** subtree was requireAuth()-only.
// RULE — sort-results are curator-scoped: only result.curatorId, AND a member of
// the result's collection, may act on it. Drives REAL handlers + the shared guard
// against ephemeral Postgres; mocks only auth + db.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
// Flat-replace BOTH exports the routes use, derived from one spy (spread form pulls in nodemailer).
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

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Seed a collection owned by ownerId with one result whose curator is curatorId. */
async function seedResult(ownerId: string, curatorId: string) {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  await db.execute(sql`
    INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
    VALUES (${collectionId}, ${ownerId}, 'Result authz', 'active', now(), now())
  `);
  const result = await new SortResultRepository(db).create({
    collectionId, curatorId, name: "R", status: "draft",
  });
  return { collectionId, resultId: result.id };
}

/** Add a distinct member (curator role, full sort access) to the collection. */
async function addMember(collectionId: string): Promise<string> {
  const { db } = getTestDb();
  const memberId = generateId("user");
  await db.insert((await import("@/lib/db/schema")).user).values({
    id: memberId, email: `m-${memberId}@adored.test`, name: "Member",
  });
  await new MembershipRepository(db).create({
    collectionId, userId: memberId, role: "curator",
    canManageCollection: false, canInviteMembers: false, canAddItems: true,
    canEditMetadata: true, canAddPhotos: true, canDeletePhotos: false,
    canSort: true, canViewOutputs: true,
  });
  return memberId;
}

describeDb("requireApiResultAccess (guard -> DB) — purses-axn", () => {
  let ownerId: string;
  beforeEach(async () => { await resetDb(); ownerId = await seedBaseline(); });
  afterAll(async () => { await closeDb(); });

  it("returns the result for its own curator (owner)", async () => {
    const { db } = getTestDb();
    const { resultId } = await seedResult(ownerId, ownerId);
    const out = await requireApiResultAccess(db, resultId, ownerId);
    expect(out).not.toBeInstanceOf(Response);
    expect((out as any).id).toBe(resultId);
  });

  it("403s a collection member who is NOT the result's curator (curator-scope)", async () => {
    const { db } = getTestDb();
    const { collectionId, resultId } = await seedResult(ownerId, ownerId);
    const memberId = await addMember(collectionId);
    const out = await requireApiResultAccess(db, resultId, memberId);
    expect((out as Response).status).toBe(403);
  });

  it("403s a non-member hitting another tenant's result (IDOR)", async () => {
    const { db } = getTestDb();
    const { resultId } = await seedResult(ownerId, ownerId);
    const out = await requireApiResultAccess(db, resultId, "intruder_user");
    expect((out as Response).status).toBe(403);
  });

  it("404s an absent result id", async () => {
    const { db } = getTestDb();
    const out = await requireApiResultAccess(db, "res_does_not_exist", ownerId);
    expect((out as Response).status).toBe(404);
  });
});
