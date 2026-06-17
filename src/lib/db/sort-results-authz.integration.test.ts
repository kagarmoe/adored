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
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";

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
import { GET as getResult, PATCH as patchResult, DELETE as deleteResult } from "@/app/api/sort-results/[id]/route";
import { POST as finalizeResult } from "@/app/api/sort-results/[id]/finalize/route";
import { GET as getItem } from "@/app/api/sort-results/[id]/items/[rid]/route";
import { GET as listItems } from "@/app/api/sort-results/[id]/items/route";
import { GET as listShares } from "@/app/api/sort-results/[id]/shares/route";
import { DELETE as deleteShare } from "@/app/api/sort-results/[id]/shares/[sid]/route";

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

  describe("sort-results [id] route handlers", () => {
    function jsonReq(body?: unknown) {
      return new Request("http://localhost/api/sort-results/x", {
        method: "POST", headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }

    it("PATCH 403s a non-member and leaves the name unchanged (IDOR)", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedResult(ownerId, ownerId);
      mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
      const res = await patchResult(jsonReq({ name: "HACKED" }) as any, { params: { id: resultId } });
      expect(res.status).toBe(403);
      expect((await new SortResultRepository(db).findById(resultId))!.name).toBe("R");
    });

    it("PATCH 403s a member who is not the curator (curator-scope)", async () => {
      const { collectionId, resultId } = await seedResult(ownerId, ownerId);
      const memberId = await addMember(collectionId);
      mockGetSession.mockResolvedValue({ user: { id: memberId } });
      const res = await patchResult(jsonReq({ name: "X" }) as any, { params: { id: resultId } });
      expect(res.status).toBe(403);
    });

    it("PATCH 200s for the curator and updates the name", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedResult(ownerId, ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await patchResult(jsonReq({ name: "Renamed" }) as any, { params: { id: resultId } });
      expect(res.status).toBe(200);
      expect((await new SortResultRepository(db).findById(resultId))!.name).toBe("Renamed");
    });

    it("finalize 403s a non-member; result stays draft", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedResult(ownerId, ownerId);
      mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
      const res = await finalizeResult(jsonReq() as any, { params: { id: resultId } });
      expect(res.status).toBe(403);
      expect((await new SortResultRepository(db).findById(resultId))!.status).toBe("draft");
    });

    it("GET 404s an absent result", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await getResult(new Request("http://localhost/x") as any, { params: { id: "res_missing" } });
      expect(res.status).toBe(404);
    });
  });

  describe("sort-results children: guard + belongs-to-parent", () => {
    it("items/[rid] GET 404s a result-item that belongs to a DIFFERENT result", async () => {
      const { db } = getTestDb();
      const { collectionId, resultId } = await seedResult(ownerId, ownerId);
      const item = await new ItemRepository(db).create({ collectionId }); // real FK parent
      const other = await new SortResultRepository(db).create({ collectionId, curatorId: ownerId, name: "Other", status: "draft" });
      const otherItem = await new SortResultItemRepository(db).create({
        sortResultId: other.id, itemId: item.id, computedRank: 1, computedBucket: "top",
      });
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      // Caller can access resultId, but asks for an item under `other.id`.
      const res = await getItem(new Request("http://localhost/x") as any, { params: { id: resultId, rid: otherItem.id } });
      expect(res.status).toBe(404);
    });

    it("items list GET 403s a non-member (IDOR)", async () => {
      const { resultId } = await seedResult(ownerId, ownerId);
      mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
      const res = await listItems(new Request("http://localhost/x") as any, { params: { id: resultId } });
      expect(res.status).toBe(403);
    });

    it("shares list 403s a non-member (IDOR)", async () => {
      const { resultId } = await seedResult(ownerId, ownerId);
      mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
      const res = await listShares(new Request("http://localhost/x") as any, { params: { id: resultId } });
      expect(res.status).toBe(403);
    });

    it("shares/[sid] DELETE 404s a share that belongs to a DIFFERENT result (IDOR)", async () => {
      const { db } = getTestDb();
      const { collectionId, resultId } = await seedResult(ownerId, ownerId);
      const other = await new SortResultRepository(db).create({ collectionId, curatorId: ownerId, name: "Other", status: "finalized" });
      // create() requires a shareToken — pass a unique one (the share repo has no default).
      const victimShare = await new SortResultShareRepository(db).create({ sortResultId: other.id, shareToken: generateId("tok") });
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      // Caller owns `resultId`, tries to revoke a share under `other.id` via the path id.
      const res = await deleteShare(new Request("http://localhost/x", { method: "DELETE" }) as any, { params: { id: resultId, sid: victimShare.id } });
      expect(res.status).toBe(404);
    });
  });
});
