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
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";

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
import { POST as createResult } from "@/app/api/sort-results/route";
import { GET as getResult, DELETE as deleteResult } from "@/app/api/sort-results/[id]/route";
import { POST as finalizeResult } from "@/app/api/sort-results/[id]/finalize/route";
import { GET as getItem } from "@/app/api/sort-results/[id]/items/[rid]/route";
import { GET as listShares } from "@/app/api/sort-results/[id]/shares/route";
import { GET as getShare, PATCH as patchShare, DELETE as deleteShare } from "@/app/api/sort-results/[id]/shares/[sid]/route";

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

    it("finalize 403s a non-member; result stays draft", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedResult(ownerId, ownerId);
      mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
      const res = await finalizeResult(jsonReq() as any, { params: Promise.resolve({ id: resultId }) });
      expect(res.status).toBe(403);
      expect((await new SortResultRepository(db).findById(resultId))!.status).toBe("draft");
    });

    it("GET 404s an absent result", async () => {
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await getResult(new Request("http://localhost/x") as any, { params: Promise.resolve({ id: "res_missing" }) });
      expect(res.status).toBe(404);
    });

    it("DELETE 403s a non-member and the result still exists (IDOR)", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedResult(ownerId, ownerId);
      mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
      const res = await deleteResult(new Request("http://localhost/x", { method: "DELETE" }) as any, { params: Promise.resolve({ id: resultId }) });
      expect(res.status).toBe(403);
      expect(await new SortResultRepository(db).findById(resultId)).not.toBeNull();
    });
  });

  describe("sort-results children: guard + belongs-to-parent", () => {
    it("items/[rid] GET 404s a result-item that belongs to a DIFFERENT result", async () => {
      const { db } = getTestDb();
      const { collectionId, resultId } = await seedResult(ownerId, ownerId);
      const item = await new ItemRepository(db).create({ collectionId }); // real FK parent
      const other = await new SortResultRepository(db).create({ collectionId, curatorId: ownerId, name: "Other", status: "finalized" });
      const otherItem = await new SortResultItemRepository(db).create({
        sortResultId: other.id, itemId: item.id, computedRank: 1, computedBucket: "top",
      });
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      // Caller can access resultId, but asks for an item under `other.id`.
      const res = await getItem(new Request("http://localhost/x") as any, { params: Promise.resolve({ id: resultId, rid: otherItem.id }) });
      expect(res.status).toBe(404);
    });

    it("shares list 200s for the curator and returns only this result's shares (scoped)", async () => {
      const { db } = getTestDb();
      const { collectionId, resultId } = await seedResult(ownerId, ownerId);
      // A share under THIS result, plus a share under a different same-owner result.
      const mine = await new SortResultShareRepository(db).create({ sortResultId: resultId, shareToken: generateId("tok") });
      const other = await new SortResultRepository(db).create({ collectionId, curatorId: ownerId, name: "Other", status: "finalized" });
      await new SortResultShareRepository(db).create({ sortResultId: other.id, shareToken: generateId("tok") });

      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await listShares(new Request("http://localhost/x") as any, { params: Promise.resolve({ id: resultId }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.map((s: { id: string }) => s.id)).toEqual([mine.id]);
    });

    /** A share under a DIFFERENT (same-owner) result; the caller can access `resultId`. */
    async function seedForeignShare() {
      const { db } = getTestDb();
      const { collectionId, resultId } = await seedResult(ownerId, ownerId);
      const other = await new SortResultRepository(db).create({ collectionId, curatorId: ownerId, name: "Other", status: "finalized" });
      // create() requires a shareToken — pass a unique one (the share repo has no default).
      const victimShare = await new SortResultShareRepository(db).create({ sortResultId: other.id, shareToken: generateId("tok") });
      return { resultId, foreignShareId: victimShare.id };
    }

    it("shares/[sid] GET 404s a share that belongs to a DIFFERENT result (IDOR)", async () => {
      const { resultId, foreignShareId } = await seedForeignShare();
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await getShare(new Request("http://localhost/x") as any, { params: Promise.resolve({ id: resultId, sid: foreignShareId }) });
      expect(res.status).toBe(404);
    });

    it("shares/[sid] PATCH 404s a share that belongs to a DIFFERENT result (IDOR)", async () => {
      const { resultId, foreignShareId } = await seedForeignShare();
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const req = new Request("http://localhost/x", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "revoked" }),
      });
      const res = await patchShare(req as any, { params: Promise.resolve({ id: resultId, sid: foreignShareId }) });
      expect(res.status).toBe(404);
    });

    it("shares/[sid] DELETE 404s a share that belongs to a DIFFERENT result (IDOR)", async () => {
      const { resultId, foreignShareId } = await seedForeignShare();
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      // Caller owns `resultId`, tries to revoke a share under `other.id` via the path id.
      const res = await deleteShare(new Request("http://localhost/x", { method: "DELETE" }) as any, { params: Promise.resolve({ id: resultId, sid: foreignShareId }) });
      expect(res.status).toBe(404);
    });

  });

  describe("POST /api/sort-results", () => {
    function postReq(body: unknown) {
      return new Request("http://localhost/api/sort-results", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
    }

    it("403s creating a result in a collection the caller is not a member of", async () => {
      const { collectionId } = await seedResult(ownerId, ownerId);
      mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
      const res = await createResult(postReq({ collectionId, name: "X" }) as any);
      expect(res.status).toBe(403);
    });

    it("201s for a member and allocates a non-null number with curatorId = caller", async () => {
      const { collectionId } = await seedResult(ownerId, ownerId);
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await createResult(postReq({ collectionId, name: "My ranking" }) as any);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.number).toEqual(expect.any(Number));
      expect(json.curatorId).toBe(ownerId);
    });

    // SEAM PROOF (always-on db-tests tier). Asserts the INTENDED behavior: a live POST
    // that creates a result materializes one SortResultItem per the curator's preference.
    // The route delegates to SortResultService.createDraftResult, which reads preferences
    // and writes one item per preference, so findByResult is non-empty.
    it(
      "live POST /api/sort-results materializes one SortResultItem per preference",
      async () => {
        const { db } = getTestDb();
        const { collectionId } = await seedResult(ownerId, ownerId);

        // Seed items + the curator's preference rows first, so materialization WOULD
        // have rows to make (the break is the route never reading them, not empty input).
        const itemA = await new ItemRepository(db).create({ collectionId });
        const itemB = await new ItemRepository(db).create({ collectionId });
        const prefRepo = new CollectionPreferenceItemRepository(db);
        await prefRepo.create({
          collectionId, curatorId: ownerId, itemId: itemA.id,
          score: 0.875, confidence: 1, rankBucket: "top", comparisonCount: 0,
        });
        await prefRepo.create({
          collectionId, curatorId: ownerId, itemId: itemB.id,
          score: 0.375, confidence: 1, rankBucket: "medium", comparisonCount: 0,
        });

        mockGetSession.mockResolvedValue({ user: { id: ownerId } });
        const res = await createResult(postReq({ collectionId, name: "My ranking" }) as any);
        expect(res.status).toBe(201);
        const newId = (await res.json()).id as string;

        // The intended postcondition: the result is populated. Fails today ([]).
        const items = await new SortResultItemRepository(db).findByResult(newId);
        expect(items.length).toBeGreaterThan(0);
      },
    );
  });
});
