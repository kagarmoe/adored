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
import { GET as getResult, PATCH as patchResult, DELETE as deleteResult } from "@/app/api/sort-results/[id]/route";
import { POST as finalizeResult } from "@/app/api/sort-results/[id]/finalize/route";
import { GET as getItem, PATCH as patchItem, DELETE as deleteItem } from "@/app/api/sort-results/[id]/items/[rid]/route";
import { POST as resetItem } from "@/app/api/sort-results/[id]/items/[rid]/reset/route";
import { GET as listItems } from "@/app/api/sort-results/[id]/items/route";
import { GET as listShares, POST as createShare } from "@/app/api/sort-results/[id]/shares/route";
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

    it("DELETE 403s a non-member and the result still exists (IDOR)", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedResult(ownerId, ownerId);
      mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
      const res = await deleteResult(new Request("http://localhost/x", { method: "DELETE" }) as any, { params: { id: resultId } });
      expect(res.status).toBe(403);
      expect(await new SortResultRepository(db).findById(resultId)).not.toBeNull();
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

    /** A result-item under a DIFFERENT (same-owner) result; the caller can access `resultId`. */
    async function seedForeignResultItem() {
      const { db } = getTestDb();
      const { collectionId, resultId } = await seedResult(ownerId, ownerId);
      const item = await new ItemRepository(db).create({ collectionId }); // real FK parent
      const other = await new SortResultRepository(db).create({ collectionId, curatorId: ownerId, name: "Other", status: "draft" });
      const otherItem = await new SortResultItemRepository(db).create({
        sortResultId: other.id, itemId: item.id, computedRank: 1, computedBucket: "top",
      });
      return { resultId, foreignItemId: otherItem.id };
    }

    it("items/[rid] PATCH 404s a result-item that belongs to a DIFFERENT result", async () => {
      const { resultId, foreignItemId } = await seedForeignResultItem();
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const req = new Request("http://localhost/x", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ manualBucket: "top" }),
      });
      const res = await patchItem(req as any, { params: { id: resultId, rid: foreignItemId } });
      expect(res.status).toBe(404);
    });

    it("items/[rid] DELETE 404s a result-item that belongs to a DIFFERENT result", async () => {
      const { resultId, foreignItemId } = await seedForeignResultItem();
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await deleteItem(new Request("http://localhost/x", { method: "DELETE" }) as any, { params: { id: resultId, rid: foreignItemId } });
      expect(res.status).toBe(404);
    });

    it("items/[rid]/reset POST 404s a result-item that belongs to a DIFFERENT result", async () => {
      const { resultId, foreignItemId } = await seedForeignResultItem();
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const res = await resetItem(new Request("http://localhost/x", { method: "POST" }) as any, { params: { id: resultId, rid: foreignItemId } });
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
      const res = await getShare(new Request("http://localhost/x") as any, { params: { id: resultId, sid: foreignShareId } });
      expect(res.status).toBe(404);
    });

    it("shares/[sid] PATCH 404s a share that belongs to a DIFFERENT result (IDOR)", async () => {
      const { resultId, foreignShareId } = await seedForeignShare();
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      const req = new Request("http://localhost/x", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "revoked" }),
      });
      const res = await patchShare(req as any, { params: { id: resultId, sid: foreignShareId } });
      expect(res.status).toBe(404);
    });

    it("shares/[sid] DELETE 404s a share that belongs to a DIFFERENT result (IDOR)", async () => {
      const { resultId, foreignShareId } = await seedForeignShare();
      mockGetSession.mockResolvedValue({ user: { id: ownerId } });
      // Caller owns `resultId`, tries to revoke a share under `other.id` via the path id.
      const res = await deleteShare(new Request("http://localhost/x", { method: "DELETE" }) as any, { params: { id: resultId, sid: foreignShareId } });
      expect(res.status).toBe(404);
    });

    it("shares POST 403s a non-member (IDOR)", async () => {
      const { resultId } = await seedResult(ownerId, ownerId);
      mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
      const req = new Request("http://localhost/x", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
      });
      const res = await createShare(req as any, { params: { id: resultId } });
      expect(res.status).toBe(403);
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

    // SEAM TRIPWIRE (Task 12, always-on db-tests tier). Asserts the INTENDED behavior:
    // a live POST that creates a result should materialize one SortResultItem per the
    // curator's preference. It is RED today — the route calls SortResultRepository.create
    // directly and never SortResultService.createDraftResult, so findByResult is []. We
    // pin that broken seam with test.fails(): GREEN while the break exists (the body
    // throws on the empty assertion), and it ERRORS the moment the route is wired to
    // materialize items — forcing this guard to flip to a plain `it`.
    it.fails(
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
