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
import { deriveStanding } from "@/features/results/standing";
import { partitionRanked } from "@/lib/results-buckets";
import type { Item } from "@/types";

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

import { POST as createResult } from "@/app/api/sort-results/route";
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

    // Co-bucketed "top" prefs sharing a score; the finalize order is decided
    // purely by orderRank (Epic 0 Task 10): highItem (0) before lowItem (1).
    const prefRepo = new CollectionPreferenceItemRepository(db);
    await prefRepo.create({
      collectionId, curatorId: ownerId, itemId: lowItem.id,
      score: 0.875, confidence: 1, rankBucket: "top", comparisonCount: 0,
      orderRank: 1,
    });
    await prefRepo.create({
      collectionId, curatorId: ownerId, itemId: highItem.id,
      score: 0.875, confidence: 1, rankBucket: "top", comparisonCount: 0,
      orderRank: 0,
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

  // ── POST (create) input validation ────────────────────────────────────────
  // Recovers the two POST-create 400 branches (route.ts ~L25-26) orphaned when
  // Phase-3 Task 7 deleted the mocked sibling. Both fire BEFORE getDb()/access/
  // service, so they're trivial in the integration tier; each is paired with a
  // findByCollection read proving no sort_results row landed (non-vacuous).
  describe("POST /api/sort-results (create) — input validation", () => {
    it("400s a body missing collectionId; no result row is created", async () => {
      const { db } = getTestDb();
      const collectionId = await seedCollection();
      // Non-vacuous: the collection has zero results BEFORE.
      expect(await new SortResultRepository(db).findByCollection(collectionId)).toEqual([]);

      login(ownerId);
      const res = await createResult(jsonReq("POST", { name: "X" }) as any);
      expect(res.status).toBe(400);
      // Still zero — the validation guard fired before any write.
      expect(await new SortResultRepository(db).findByCollection(collectionId)).toEqual([]);
    });

    it("400s a body missing name; no result row is created", async () => {
      const { db } = getTestDb();
      const collectionId = await seedCollection();
      expect(await new SortResultRepository(db).findByCollection(collectionId)).toEqual([]);

      login(ownerId);
      const res = await createResult(jsonReq("POST", { collectionId }) as any);
      expect(res.status).toBe(400);
      expect(await new SortResultRepository(db).findByCollection(collectionId)).toEqual([]);
    });
  });

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

    it("409s when finalizing an already-finalized result (state guard)", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedPopulatedDraft();
      login(ownerId);
      const first = await finalizeResult(jsonReq("POST") as any, { params: { id: resultId } } as any);
      expect(first.status).toBe(200);

      const second = await finalizeResult(jsonReq("POST") as any, { params: { id: resultId } } as any);
      expect(second.status).toBe(409);
      // Still finalized — the state guard fired, nothing changed.
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
      // orderRank 0 is computedRank 0 (best); ordering proves it is the result's items.
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

    it("PATCH bad manualBucket enum -> 400 (ZodError mapped via errorResponse), no mutation", async () => {
      const { db } = getTestDb();
      const { resultId } = await seedPopulatedDraft();
      const item = await firstResultItem(resultId);
      login(ownerId);
      const res = await patchItem(
        jsonReq("PATCH", { manualBucket: "not-a-bucket" }) as any,
        { params: { id: resultId, rid: item.id } } as any,
      );
      expect(res.status).toBe(400);
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

  // ── Finalize snapshot semantics (Epic 5b) ─────────────────────────────────
  // The unified Decide surface renders LIVE preferences directly (Standing); the
  // spec's canonical order is the live one, and Finalize SNAPSHOTS it. These
  // pin three facts the Decide flow depends on:
  //   1. FROZEN — a finalized result's sort_result_items never move when live
  //      preferences change afterward (add an item / rewrite orderRank).
  //   2. FRESH-AT-FINALIZE — the Finalize entry POSTs a NEW draft materialized
  //      from CURRENT live prefs, so it reflects the current Standing, never a
  //      stale earlier draft.
  //   3. SHARED DERIVATION — the live Standing (deriveStanding) and the finalize
  //      snapshot come from the SAME rankPreferencesToItems derivation: the
  //      most-loved item is identical in both.
  describe("Finalize snapshot semantics: live-canonical, snapshot-frozen", () => {
    /**
     * Seed a collection with two "top" items (highItem orderRank 0, lowItem
     * orderRank 1) but DO NOT materialize a draft — the live preferences are the
     * source of truth the Decide surface reads. Returns the ids + a live-prefs
     * reader so cases can mutate prefs and re-read Standing.
     */
    async function seedLivePrefs() {
      const { db } = getTestDb();
      const collectionId = await seedCollection();
      const itemRepo = new ItemRepository(db);
      const highItem = await itemRepo.create({ collectionId });
      const lowItem = await itemRepo.create({ collectionId });
      const prefRepo = new CollectionPreferenceItemRepository(db);
      await prefRepo.create({
        collectionId, curatorId: ownerId, itemId: highItem.id,
        score: 0.9, confidence: 1, rankBucket: "top", comparisonCount: 0, orderRank: 0,
      });
      await prefRepo.create({
        collectionId, curatorId: ownerId, itemId: lowItem.id,
        score: 0.8, confidence: 1, rankBucket: "top", comparisonCount: 0, orderRank: 1,
      });
      return { collectionId, highItemId: highItem.id, lowItemId: lowItem.id };
    }

    it("freezes the snapshot: finalized items are UNCHANGED after later live-pref changes (insert + orderRank rewrite)", async () => {
      const { db } = getTestDb();
      const { collectionId, highItemId, lowItemId } = await seedLivePrefs();
      const itemRepo = new ItemRepository(db);
      const prefRepo = new CollectionPreferenceItemRepository(db);
      const sortItemRepo = new SortResultItemRepository(db);

      // Materialize the current live order into a draft (what the Finalize entry's
      // POST does), then finalize it.
      login(ownerId);
      const created = await createResult(
        jsonReq("POST", { collectionId, name: "Frozen" }) as any,
      );
      expect(created.status).toBe(201);
      const resultId = (await created.json()).id as string;
      const finalized = await finalizeResult(
        jsonReq("POST") as any, { params: { id: resultId } } as any,
      );
      expect(finalized.status).toBe(200);

      // BEFORE: snapshot is [highItem@0, lowItem@1].
      const before = [...(await sortItemRepo.findByResult(resultId))]
        .sort((a, b) => a.computedRank - b.computedRank);
      expect(before.map((i) => i.itemId)).toEqual([highItemId, lowItemId]);

      // Now MUTATE the live preferences, all AFTER finalize. orderRank is UNIQUE
      // per (collection, curator), so move the originals out of the way (0,1 ->
      // 10,11) BEFORE inserting the new item at 0 — no transient collision.
      const highPref = await prefRepo.findByItem(highItemId, ownerId);
      const lowPref = await prefRepo.findByItem(lowItemId, ownerId);
      await prefRepo.update(highPref!.id, { orderRank: 10 });
      await prefRepo.update(lowPref!.id, { orderRank: 11 });
      //  insert a brand-new loved item at the top (orderRank 0),
      const inserted = await itemRepo.create({ collectionId });
      await prefRepo.create({
        collectionId, curatorId: ownerId, itemId: inserted.id,
        score: 0.99, confidence: 1, rankBucket: "top", comparisonCount: 0, orderRank: 0,
      });

      // The LIVE Standing now reflects the changes (proves the mutation took).
      const items = [
        { id: highItemId } as Item, { id: lowItemId } as Item, { id: inserted.id } as Item,
      ];
      const itemById = new Map(items.map((i) => [i.id, i]));
      const livePrefs = await prefRepo.findByCollection(collectionId, ownerId);
      const standing = deriveStanding(livePrefs, itemById);
      expect(standing.loved).toHaveLength(3);
      expect(standing.loved[0].item.id).toBe(inserted.id); // new item is most-loved live

      // AFTER: the finalized snapshot is byte-for-byte the SAME — no insertion, no
      // reorder leaked in. Frozen.
      const after = [...(await sortItemRepo.findByResult(resultId))]
        .sort((a, b) => a.computedRank - b.computedRank);
      expect(after.map((i) => i.itemId)).toEqual([highItemId, lowItemId]);
      expect(after.map((i) => i.computedRank)).toEqual(before.map((i) => i.computedRank));
      expect(after.map((i) => i.computedBucket)).toEqual(before.map((i) => i.computedBucket));
    });

    it("preserves a manual overlay on the frozen snapshot across later live-pref changes", async () => {
      const { db } = getTestDb();
      const { collectionId, highItemId, lowItemId } = await seedLivePrefs();
      const prefRepo = new CollectionPreferenceItemRepository(db);
      const sortItemRepo = new SortResultItemRepository(db);

      login(ownerId);
      const created = await createResult(
        jsonReq("POST", { collectionId, name: "Overlay" }) as any,
      );
      const resultId = (await created.json()).id as string;

      // Manual tweak on the SNAPSHOT (the overlay lives only here, never on live
      // Standing): push the top item down to "low", then finalize.
      const topRow = [...(await sortItemRepo.findByResult(resultId))]
        .sort((a, b) => a.computedRank - b.computedRank)[0];
      expect(topRow.itemId).toBe(highItemId);
      await sortItemRepo.update(topRow.id, { manualBucket: "low", manualRank: 3 });
      await finalizeResult(jsonReq("POST") as any, { params: { id: resultId } } as any);

      // Mutate live prefs afterward.
      const lowPref = await prefRepo.findByItem(lowItemId, ownerId);
      await prefRepo.update(lowPref!.id, { orderRank: 99 });

      // The manual overlay on the finalized snapshot SURVIVES — not silently
      // dropped, not overwritten by any live-pref refresh.
      const persisted = await sortItemRepo.findById(topRow.id);
      expect(persisted!.manualBucket).toBe("low");
      expect(persisted!.manualRank).toBe(3);
    });

    it("Finalize snapshots CURRENT Standing, not a stale earlier draft", async () => {
      const { db } = getTestDb();
      const { collectionId, highItemId, lowItemId } = await seedLivePrefs();
      const prefRepo = new CollectionPreferenceItemRepository(db);
      const sortItemRepo = new SortResultItemRepository(db);

      // An EARLIER draft exists (e.g. an abandoned Finalize attempt): order is
      // [highItem, lowItem].
      login(ownerId);
      const staleRes = await createResult(
        jsonReq("POST", { collectionId, name: "Stale" }) as any,
      );
      const staleId = (await staleRes.json()).id as string;
      const staleSnap = [...(await sortItemRepo.findByResult(staleId))]
        .sort((a, b) => a.computedRank - b.computedRank);
      expect(staleSnap.map((i) => i.itemId)).toEqual([highItemId, lowItemId]);

      // Standing changes: flip the live order so lowItem is now most-loved.
      // orderRank is UNIQUE per (collection, curator): move high 0 -> 2 first (2
      // is free), then low 1 -> 0 (now free) — no transient collision.
      const highPref = await prefRepo.findByItem(highItemId, ownerId);
      const lowPref = await prefRepo.findByItem(lowItemId, ownerId);
      await prefRepo.update(highPref!.id, { orderRank: 2 });
      await prefRepo.update(lowPref!.id, { orderRank: 0 });

      // Clicking Finalize again POSTs a FRESH draft. It must reflect the CURRENT
      // Standing (lowItem first), NOT reuse the stale draft's order.
      const freshRes = await createResult(
        jsonReq("POST", { collectionId, name: "Fresh" }) as any,
      );
      const freshId = (await freshRes.json()).id as string;
      expect(freshId).not.toBe(staleId); // a new draft, not the stale one
      const freshSnap = [...(await sortItemRepo.findByResult(freshId))]
        .sort((a, b) => a.computedRank - b.computedRank);
      expect(freshSnap.map((i) => i.itemId)).toEqual([lowItemId, highItemId]);

      // Finalize the fresh one; its frozen order is the current Standing.
      const finalized = await finalizeResult(
        jsonReq("POST") as any, { params: { id: freshId } } as any,
      );
      expect(finalized.status).toBe(200);
      const frozen = [...(await sortItemRepo.findByResult(freshId))]
        .sort((a, b) => a.computedRank - b.computedRank);
      expect(frozen[0].itemId).toBe(lowItemId);
    });

    it("live Standing and the finalize snapshot share ONE derivation (same most-loved item)", async () => {
      const { db } = getTestDb();
      const { collectionId, highItemId, lowItemId } = await seedLivePrefs();
      const prefRepo = new CollectionPreferenceItemRepository(db);
      const sortItemRepo = new SortResultItemRepository(db);

      // The LIVE Standing's most-loved item (what the Decide surface renders).
      const items = [{ id: highItemId } as Item, { id: lowItemId } as Item];
      const itemById = new Map(items.map((i) => [i.id, i]));
      const livePrefs = await prefRepo.findByCollection(collectionId, ownerId);
      const standing = deriveStanding(livePrefs, itemById);
      const standingMostLoved = standing.loved[0].item.id;

      // The finalize snapshot's most-loved item (computedRank 0 of the loved
      // partition, mirroring how the snapshot viewer derives it).
      login(ownerId);
      const created = await createResult(
        jsonReq("POST", { collectionId, name: "Shared" }) as any,
      );
      const resultId = (await created.json()).id as string;
      const snapRows = (await sortItemRepo.findByResult(resultId)).map((r) => ({
        itemId: r.itemId, computedRank: r.computedRank,
        computedBucket: r.computedBucket, manualBucket: r.manualBucket,
      }));
      const { loved } = partitionRanked(snapRows);
      const snapshotMostLoved = [...loved]
        .sort((a, b) => a.computedRank - b.computedRank)[0].itemId;

      // Same derivation → same most-loved item, no divergence between the two
      // Put-in-order entry points.
      expect(snapshotMostLoved).toBe(standingMostLoved);
      expect(standingMostLoved).toBe(highItemId);
    });
  });
});
