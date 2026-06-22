// @vitest-environment node
//
// Phase-3 Task 7: the HAPPY + ERROR/state-guard branches of the sort-results
// subtree that sort-results-authz (authz / IDOR / belongs-to-parent) and
// sort-pipeline (createDraftResult materialization, [id] PATCH/DELETE 409,
// items/[rid] DELETE, service-level supersede clone) do NOT execute. Real
// handler -> controller/service -> repo -> ephemeral Postgres; mocks ONLY the
// two true boundaries (auth + db). No blob — sort-results never touch it.
//
// Scope here is the gap branches ONLY (no duplication):
//   - [id] GET happy (returns the result)
//   - finalize POST happy (draft -> finalized, persisted) + the pinned NO-state-guard
//     fact (re-finalize is idempotent; there is no 409 — purses-ydph)
//   - items GET happy (returns the result's items in computed-rank order)
//   - items/[rid] GET happy; PATCH happy (manual override persists); PATCH 409
//     finalized; PATCH invalid-JSON 400; PATCH bad-enum -> pinned 500 (purses-ydph)
//   - items/[rid]/reset POST happy (override present before -> cleared after);
//     reset 409 finalized
//   - shares POST happy (creates a row, read back) + invalid-JSON 400
//   - shares/[sid] GET happy; PATCH happy (revoke persists) + invalid-JSON 400;
//     DELETE happy (active before -> revoked after)
//   - supersede POST: 401 / 403 / 404 / 409-state-guard / happy clone-through-route
//     (new draft present after, absent before; ORIGINAL finalized + unchanged)
//
// Every "absent/cleared/changed after" is paired with a "present/set/unchanged
// before" read via a repo, so a never-seeded row can't pass an assertion vacuously.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { SortResultService } from "@/server/services/SortResultService";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
// Flat-replace BOTH @/lib/auth exports from one spy (spread/importActual pulls nodemailer).
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireAuth: async () => {
    const s = await mockGetSession();
    if (!s?.user) throw new Error("Unauthorized");
    return s.user;
  },
}));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { GET as getResult } from "@/app/api/sort-results/[id]/route";
import { POST as finalizeResult } from "@/app/api/sort-results/[id]/finalize/route";
import { GET as listItems } from "@/app/api/sort-results/[id]/items/route";
import { GET as getItem, PATCH as patchItem } from "@/app/api/sort-results/[id]/items/[rid]/route";
import { POST as resetItem } from "@/app/api/sort-results/[id]/items/[rid]/reset/route";
import { POST as createShare } from "@/app/api/sort-results/[id]/shares/route";
import { GET as getShare, PATCH as patchShare, DELETE as deleteShare } from "@/app/api/sort-results/[id]/shares/[sid]/route";
import { POST as supersede } from "@/app/api/sort-results/[id]/supersede/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function jsonReq(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/sort-results/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
/** A request whose body is malformed JSON, so handler `req.json()` throws SyntaxError. */
function badJsonReq(method: string): Request {
  return new Request("http://localhost/api/sort-results/x", {
    method,
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
}

describeDb("sort-results pipeline: happy + error branches (route -> repo -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });
  afterAll(async () => {
    await closeDb();
  });

  /** A collection owned by ownerId. */
  async function seedCollection(): Promise<string> {
    const { db } = getTestDb();
    const collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Pipeline branches', 'active', now(), now())
    `);
    return collectionId;
  }

  /**
   * Seed a populated DRAFT result (owner = curator) the correct way: two real
   * items + two preferences, then SortResultService.createDraftResult materializes
   * one ranked SortResultItem per preference. Returns ids the cases assert against.
   */
  async function seedPopulatedDraft() {
    const { db } = getTestDb();
    const collectionId = await seedCollection();
    const itemRepo = new ItemRepository(db);
    const lowItem = await itemRepo.create({ collectionId });
    const highItem = await itemRepo.create({ collectionId });

    const prefRepo = new CollectionPreferenceItemRepository(db);
    await prefRepo.create({
      collectionId, curatorId: ownerId, itemId: lowItem.id,
      score: 0.375, confidence: 1, rankBucket: "medium", comparisonCount: 0,
    });
    await prefRepo.create({
      collectionId, curatorId: ownerId, itemId: highItem.id,
      score: 0.875, confidence: 1, rankBucket: "top", comparisonCount: 0,
    });

    const service = new SortResultService(
      new SortResultRepository(db),
      new SortResultItemRepository(db),
      prefRepo,
      db,
    );
    const result = await service.createDraftResult(collectionId, ownerId, "Draft branches");
    return { collectionId, resultId: result.id, highItemId: highItem.id, lowItemId: lowItem.id };
  }

  function login(id: string) {
    mockGetSession.mockResolvedValue({ user: { id } });
  }

  // ── [id] GET ────────────────────────────────────────────────────────────
  describe("GET /api/sort-results/[id]", () => {
    it("200s for the curator and returns the result", async () => {
      const { resultId } = await seedPopulatedDraft();
      login(ownerId);
      const res = await getResult(jsonReq("GET") as any, { params: { id: resultId } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ id: resultId, status: "draft", curatorId: ownerId });
    });
  });

  // ── finalize POST ─────────────────────────────────────────────────────────
  describe("POST /api/sort-results/[id]/finalize", () => {
    it("200s and flips a draft to finalized (status persists, read back)", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedPopulatedDraft();
      // Non-vacuous: it is a draft BEFORE.
      expect((await new SortResultRepository(db).findById(resultId))!.status).toBe("draft");

      login(ownerId);
      const res = await finalizeResult(jsonReq("POST") as any, { params: { id: resultId } } as any);
      expect(res.status).toBe(200);
      expect((await res.json()).status).toBe("finalized");

      const persisted = await new SortResultRepository(db).findById(resultId);
      expect(persisted!.status).toBe("finalized");
      expect(persisted!.finalizedAt).not.toBeNull();
    });

    // PINNED behavior (purses-ydph): the finalize route has NO state guard — it
    // unconditionally updates status to "finalized". So finalizing an ALREADY
    // finalized result simply succeeds again (200, idempotent), NOT 409. The
    // brief's "state-guard error" does not exist for this route today; pinning
    // the actual behavior, not fixing it.
    it("is idempotent on an already-finalized result (200 again, no 409) — purses-ydph pin", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedPopulatedDraft();
      login(ownerId);
      const first = await finalizeResult(jsonReq("POST") as any, { params: { id: resultId } } as any);
      expect(first.status).toBe(200);

      const second = await finalizeResult(jsonReq("POST") as any, { params: { id: resultId } } as any);
      expect(second.status).toBe(200);
      expect((await new SortResultRepository(db).findById(resultId))!.status).toBe("finalized");
    });
  });

  // ── items GET (list) ──────────────────────────────────────────────────────
  describe("GET /api/sort-results/[id]/items", () => {
    it("200s for the curator and returns the result's items in computed-rank order", async () => {
      const { resultId, highItemId, lowItemId } = await seedPopulatedDraft();
      login(ownerId);
      const res = await listItems(jsonReq("GET") as any, { params: { id: resultId } } as any);
      expect(res.status).toBe(200);
      const items = (await res.json()) as Array<{ itemId: string; computedRank: number }>;
      expect(items).toHaveLength(2);
      // Highest score is computedRank 0 (best); ordering proves it is the result's items.
      const byRank = [...items].sort((a, b) => a.computedRank - b.computedRank);
      expect(byRank[0].itemId).toBe(highItemId);
      expect(byRank[1].itemId).toBe(lowItemId);
    });
  });

  // ── items/[rid] GET / PATCH ───────────────────────────────────────────────
  describe("GET·PATCH /api/sort-results/[id]/items/[rid]", () => {
    /** The result's highest-ranked SortResultItem id. */
    async function firstResultItem(resultId: string) {
      const items = await new SortResultItemRepository(getTestDb().db).findByResult(resultId);
      return [...items].sort((a, b) => a.computedRank - b.computedRank)[0];
    }

    it("GET 200s and returns the item that belongs to the result", async () => {
      const { resultId } = await seedPopulatedDraft();
      const item = await firstResultItem(resultId);
      login(ownerId);
      const res = await getItem(jsonReq("GET") as any, { params: { id: resultId, rid: item.id } } as any);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ id: item.id, sortResultId: resultId });
    });

    it("PATCH 200s and persists a manual bucket/rank override", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedPopulatedDraft();
      const item = await firstResultItem(resultId);
      // Non-vacuous: no override set BEFORE.
      expect(item.manualBucket).toBeNull();
      expect(item.manualRank).toBeNull();

      login(ownerId);
      const res = await patchItem(
        jsonReq("PATCH", { manualBucket: "low", manualRank: 9 }) as any,
        { params: { id: resultId, rid: item.id } } as any,
      );
      expect(res.status).toBe(200);

      const after = await new SortResultItemRepository(db).findById(item.id);
      expect(after!.manualBucket).toBe("low");
      expect(after!.manualRank).toBe(9);
    });

    it("PATCH 409s when the parent result is finalized (override not applied)", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedPopulatedDraft();
      const item = await firstResultItem(resultId);
      await new SortResultService(
        new SortResultRepository(db), new SortResultItemRepository(db),
        new CollectionPreferenceItemRepository(db), db,
      ).finalizeResult(resultId);

      login(ownerId);
      const res = await patchItem(
        jsonReq("PATCH", { manualBucket: "low" }) as any,
        { params: { id: resultId, rid: item.id } } as any,
      );
      expect(res.status).toBe(409);
      // The item on a finalized result must be unchanged.
      expect((await new SortResultItemRepository(db).findById(item.id))!.manualBucket).toBeNull();
    });

    it("PATCH 400s on invalid JSON (override not applied)", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedPopulatedDraft();
      const item = await firstResultItem(resultId);
      login(ownerId);
      const res = await patchItem(badJsonReq("PATCH") as any, { params: { id: resultId, rid: item.id } } as any);
      expect(res.status).toBe(400);
      expect((await new SortResultItemRepository(db).findById(item.id))!.manualBucket).toBeNull();
    });

    // PINNED behavior (purses-ydph): the Zod UpdateResultItemSchema rejects a bad
    // enum, but the handler only special-cases SyntaxError -> 400; a ZodError
    // falls through to the generic catch -> 500 (NOT 400). Pinning the actual
    // status, not fixing it. The mutation must NOT land.
    it("PATCH bad manualBucket enum -> pinned 500 (not 400), no mutation — purses-ydph pin", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedPopulatedDraft();
      const item = await firstResultItem(resultId);
      login(ownerId);
      const res = await patchItem(
        jsonReq("PATCH", { manualBucket: "not-a-bucket" }) as any,
        { params: { id: resultId, rid: item.id } } as any,
      );
      expect(res.status).toBe(500);
      expect((await new SortResultItemRepository(db).findById(item.id))!.manualBucket).toBeNull();
    });
  });

  // ── items/[rid]/reset POST ────────────────────────────────────────────────
  describe("POST /api/sort-results/[id]/items/[rid]/reset", () => {
    it("200s and clears a manual override (set before -> null after)", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedPopulatedDraft();
      const itemRepo = new SortResultItemRepository(db);
      const item = (await itemRepo.findByResult(resultId))[0];
      // Set an override directly, then assert it is PRESENT before the reset.
      await itemRepo.update(item.id, { manualBucket: "low", manualRank: 7 });
      const before = await itemRepo.findById(item.id);
      expect(before!.manualBucket).toBe("low");
      expect(before!.manualRank).toBe(7);

      login(ownerId);
      const res = await resetItem(jsonReq("POST") as any, { params: { id: resultId, rid: item.id } } as any);
      expect(res.status).toBe(200);

      const after = await itemRepo.findById(item.id);
      expect(after!.manualBucket).toBeNull();
      expect(after!.manualRank).toBeNull();
    });

    it("409s when the parent result is finalized (override preserved)", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedPopulatedDraft();
      const itemRepo = new SortResultItemRepository(db);
      const item = (await itemRepo.findByResult(resultId))[0];
      await itemRepo.update(item.id, { manualBucket: "low", manualRank: 7 });
      await new SortResultService(
        new SortResultRepository(db), new SortResultItemRepository(db),
        new CollectionPreferenceItemRepository(db), db,
      ).finalizeResult(resultId);

      login(ownerId);
      const res = await resetItem(jsonReq("POST") as any, { params: { id: resultId, rid: item.id } } as any);
      expect(res.status).toBe(409);
      // The override on a finalized result must survive the reset attempt.
      expect((await itemRepo.findById(item.id))!.manualBucket).toBe("low");
    });
  });

  // ── shares POST ───────────────────────────────────────────────────────────
  describe("POST /api/sort-results/[id]/shares", () => {
    it("201s, creates a share row, and returns the token (read back)", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedPopulatedDraft();
      const shareRepo = new SortResultShareRepository(db);
      // Non-vacuous: no shares for this result BEFORE.
      expect(await shareRepo.findByResult(resultId)).toEqual([]);

      login(ownerId);
      const res = await createShare(jsonReq("POST", {}) as any, { params: { id: resultId } } as any);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(typeof body.shareToken).toBe("string");
      expect(body.shareToken.length).toBeGreaterThan(0);

      const after = await shareRepo.findByResult(resultId);
      expect(after).toHaveLength(1);
      expect(after[0].id).toBe(body.id);
      expect(after[0].status).toBe("active");
    });

    it("400s on invalid JSON (no share created)", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedPopulatedDraft();
      login(ownerId);
      const res = await createShare(badJsonReq("POST") as any, { params: { id: resultId } } as any);
      expect(res.status).toBe(400);
      expect(await new SortResultShareRepository(db).findByResult(resultId)).toEqual([]);
    });
  });

  // ── shares/[sid] GET / PATCH / DELETE ─────────────────────────────────────
  describe("GET·PATCH·DELETE /api/sort-results/[id]/shares/[sid]", () => {
    /** A result with one active share belonging to it. */
    async function seedResultWithShare() {
      const { db } = getTestDb();
      const { resultId } = await seedPopulatedDraft();
      const share = await new SortResultShareRepository(db).create({
        sortResultId: resultId, shareToken: generateId("tok"),
      });
      return { resultId, shareId: share.id };
    }

    it("GET 200s and returns the share that belongs to the result", async () => {
      const { resultId, shareId } = await seedResultWithShare();
      login(ownerId);
      const res = await getShare(jsonReq("GET") as any, { params: { id: resultId, sid: shareId } } as any);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ id: shareId, sortResultId: resultId, status: "active" });
    });

    it("PATCH 200s and persists a revoke (active before -> revoked after)", async () => {
      const { db } = getTestDb();
      const { resultId, shareId } = await seedResultWithShare();
      expect((await new SortResultShareRepository(db).findById(shareId))!.status).toBe("active");

      login(ownerId);
      const res = await patchShare(
        jsonReq("PATCH", { status: "revoked" }) as any,
        { params: { id: resultId, sid: shareId } } as any,
      );
      expect(res.status).toBe(200);
      expect((await new SortResultShareRepository(db).findById(shareId))!.status).toBe("revoked");
    });

    it("PATCH 400s on invalid JSON (status unchanged)", async () => {
      const { db } = getTestDb();
      const { resultId, shareId } = await seedResultWithShare();
      login(ownerId);
      const res = await patchShare(badJsonReq("PATCH") as any, { params: { id: resultId, sid: shareId } } as any);
      expect(res.status).toBe(400);
      expect((await new SortResultShareRepository(db).findById(shareId))!.status).toBe("active");
    });

    it("DELETE 200s and revokes the share (active before -> revoked after)", async () => {
      const { db } = getTestDb();
      const { resultId, shareId } = await seedResultWithShare();
      expect((await new SortResultShareRepository(db).findById(shareId))!.status).toBe("active");

      login(ownerId);
      const res = await deleteShare(jsonReq("DELETE") as any, { params: { id: resultId, sid: shareId } } as any);
      expect(res.status).toBe(200);
      // DELETE is a soft-revoke (status -> "revoked"), so the row survives, revoked.
      const after = await new SortResultShareRepository(db).findById(shareId);
      expect(after).not.toBeNull();
      expect(after!.status).toBe("revoked");
    });
  });

  // ── supersede POST (FULL: 401 / 403 / 404 / 409 / happy) ───────────────────
  describe("POST /api/sort-results/[id]/supersede", () => {
    /** A FINALIZED result (owner = curator) with materialized items. */
    async function seedFinalized() {
      const { db } = getTestDb();
      const { resultId, collectionId } = await seedPopulatedDraft();
      await new SortResultService(
        new SortResultRepository(db), new SortResultItemRepository(db),
        new CollectionPreferenceItemRepository(db), db,
      ).finalizeResult(resultId);
      return { resultId, collectionId };
    }

    it("401s when unauthenticated", async () => {
      const { resultId } = await seedFinalized();
      mockGetSession.mockResolvedValue(null);
      const res = await supersede(jsonReq("POST") as any, { params: { id: resultId } } as any);
      expect(res.status).toBe(401);
    });

    it("403s a non-member and leaves the source unchanged (IDOR)", async () => {
      const { db } = getTestDb();
      const { resultId, collectionId } = await seedFinalized();
      const before = await new SortResultRepository(db).findByCollection(collectionId);
      login("intruder_user");
      const res = await supersede(jsonReq("POST") as any, { params: { id: resultId } } as any);
      expect(res.status).toBe(403);
      // No new result was cloned into the collection.
      expect(await new SortResultRepository(db).findByCollection(collectionId)).toHaveLength(before.length);
    });

    it("404s an absent result id", async () => {
      login(ownerId);
      const res = await supersede(jsonReq("POST") as any, { params: { id: "result_missing" } } as any);
      expect(res.status).toBe(404);
    });

    // State guard: supersede requires a FINALIZED source. A draft -> 409.
    it("409s a non-finalized (draft) result; nothing cloned", async () => {
      const { db } = getTestDb();
      const { resultId, collectionId } = await seedPopulatedDraft();
      const before = await new SortResultRepository(db).findByCollection(collectionId);
      login(ownerId);
      const res = await supersede(jsonReq("POST") as any, { params: { id: resultId } } as any);
      expect(res.status).toBe(409);
      expect(await new SortResultRepository(db).findByCollection(collectionId)).toHaveLength(before.length);
    });

    it("201s cloning a finalized result into a NEW draft; the original is unchanged", async () => {
      const { db } = getTestDb();
      const { resultId, collectionId } = await seedFinalized();
      const resultRepo = new SortResultRepository(db);
      const itemRepo = new SortResultItemRepository(db);

      // BEFORE: exactly one result in the collection (the finalized source), and
      // it carries its materialized items.
      const before = await resultRepo.findByCollection(collectionId);
      expect(before).toHaveLength(1);
      const sourceItemsBefore = await itemRepo.findByResult(resultId);
      expect(sourceItemsBefore.length).toBeGreaterThan(0);

      login(ownerId);
      const res = await supersede(jsonReq("POST") as any, { params: { id: resultId } } as any);
      expect(res.status).toBe(201);
      const revision = await res.json();
      expect(revision.id).not.toBe(resultId);
      expect(revision.status).toBe("draft");
      expect(revision.name).toBe("Draft branches (Revision)");

      // AFTER: a NEW row exists (count +1), the revision is a real persisted draft
      // carrying the same item count as the source.
      const after = await resultRepo.findByCollection(collectionId);
      expect(after).toHaveLength(before.length + 1);
      const persistedRevision = await resultRepo.findById(revision.id);
      expect(persistedRevision).not.toBeNull();
      expect(persistedRevision!.status).toBe("draft");
      expect(await itemRepo.findByResult(revision.id)).toHaveLength(sourceItemsBefore.length);

      // The ORIGINAL finalized result is UNCHANGED: still finalized, same item set.
      const source = await resultRepo.findById(resultId);
      expect(source!.status).toBe("finalized");
      expect(source!.finalizedAt).not.toBeNull();
      expect(await itemRepo.findByResult(resultId)).toHaveLength(sourceItemsBefore.length);
    });
  });
});
