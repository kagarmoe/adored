// Real-DB integration proof for:
//   GET  /api/collections/[id]/preferences/items
//   POST /api/collections/[id]/preferences/recalculate
//
// Both routes use requireAuth() only — no collection-membership guard. The
// handler scopes results to the caller's own curator id, so a stranger gets an
// empty list rather than a 403. That gap is flagged below (pv9 epic).
//
// Mocks: getSession/requireAuth (auth boundary) + getDb -> test db. No blob.
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedFullCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { GET as getItems } from "@/app/api/collections/[id]/preferences/items/route";
import { POST as recalculate } from "@/app/api/collections/[id]/preferences/recalculate/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// ── helpers ──────────────────────────────────────────────────────────────────

function makeGetReq(collectionId: string) {
  return new Request(`http://localhost/api/collections/${collectionId}/preferences/items`);
}

function makePostReq(collectionId: string) {
  return new Request(
    `http://localhost/api/collections/${collectionId}/preferences/recalculate`,
    { method: "POST" },
  );
}

describeDb(
  "GET /api/collections/[id]/preferences/items + POST /api/collections/[id]/preferences/recalculate (route -> DB)",
  () => {
    let ownerId: string;

    beforeEach(async () => {
      await resetDb();
      vi.clearAllMocks();
      ownerId = await seedBaseline();
    });

    afterAll(async () => {
      await closeDb();
    });

    // ── GET preferences/items ────────────────────────────────────────────────

    describe("GET preferences/items", () => {
      it("(1) 401 when unauthenticated", async () => {
        mockGetSession.mockResolvedValue(null);
        const seed = await seedFullCollection(ownerId);

        const res = await getItems(makeGetReq(seed.collectionId) as any, {
          params: { id: seed.collectionId },
        });
        expect(res.status).toBe(401);
      });

      it("(2) returns the caller's preference rows for a collection they are a member of", async () => {
        const seed = await seedFullCollection(ownerId);
        // memberId has ONE pre-seeded preference row on itemB (score 0.5, bucket medium)
        mockGetSession.mockResolvedValue({ user: { id: seed.memberId } });

        const res = await getItems(makeGetReq(seed.collectionId) as any, {
          params: { id: seed.collectionId },
        });
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          collectionId: seed.collectionId,
          curatorId: seed.memberId,
          itemId: seed.itemBId,
          rankBucket: "medium",
        });
        expect(typeof body[0].score).toBe("number");
        expect(typeof body[0].confidence).toBe("number");
      });

      it("(3) returns empty array when the caller has no preferences yet (owner has none seeded)", async () => {
        const seed = await seedFullCollection(ownerId);
        // owner has a session + decision but NO preference rows seeded
        mockGetSession.mockResolvedValue({ user: { id: ownerId } });

        const res = await getItems(makeGetReq(seed.collectionId) as any, {
          params: { id: seed.collectionId },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
        expect(body).toHaveLength(0);
      });

      it("(4) returns empty array for an absent collection id (no 404 — route is auth-only; caller has no rows)", async () => {
        // AUTH GAP (pv9): no collection membership/existence check. A caller who is
        // authenticated but references a non-existent collection gets 200 + [] rather
        // than 404. Flag only — do not fix here.
        mockGetSession.mockResolvedValue({ user: { id: ownerId } });

        const res = await getItems(makeGetReq("col-absent-xyz") as any, {
          params: { id: "col-absent-xyz" },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
        expect(body).toHaveLength(0);
      });

      it("(5) stranger (not a member) gets 200 + empty list — AUTH GAP flagged (pv9)", async () => {
        // AUTH GAP (pv9): no membership guard on GET preferences/items. A user with no
        // relationship to the collection is not rejected — they simply see their own
        // (empty) result set. Pin the current behavior; fix is tracked under pv9.
        const seed = await seedFullCollection(ownerId);
        const strangerId = await seedUserRow("stranger");
        mockGetSession.mockResolvedValue({ user: { id: strangerId } });

        const res = await getItems(makeGetReq(seed.collectionId) as any, {
          params: { id: seed.collectionId },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(0);
      });
    });

    // ── POST preferences/recalculate ─────────────────────────────────────────

    describe("POST preferences/recalculate", () => {
      it("(6) 401 when unauthenticated", async () => {
        mockGetSession.mockResolvedValue(null);
        const seed = await seedFullCollection(ownerId);

        const res = await recalculate(makePostReq(seed.collectionId) as any, {
          params: { id: seed.collectionId },
        });
        expect(res.status).toBe(401);
      });

      it("(7) recalculate CREATES preference rows from real decision events and writes them to the DB", async () => {
        // The owner has a session with one triage event (itemA → 'top') from
        // seedFullCollection. recalculate must CREATE a pref row for itemA with
        // score=0.875 (TIER_SEED.top) and bucket='top'.
        const seed = await seedFullCollection(ownerId);
        mockGetSession.mockResolvedValue({ user: { id: ownerId } });

        // Guard: no pre-existing pref rows for the owner before recalc
        const { db } = getTestDb();
        const prefRepo = new CollectionPreferenceItemRepository(db);
        const before = await prefRepo.findByCollection(seed.collectionId, ownerId);
        expect(before).toHaveLength(0);

        const res = await recalculate(makePostReq(seed.collectionId) as any, {
          params: { id: seed.collectionId },
        });
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body).toMatchObject({ message: "Preferences recalculated" });
        expect(Array.isArray(body.preferences)).toBe(true);
        expect(body.preferences).toHaveLength(1);
        expect(body.preferences[0]).toMatchObject({
          collectionId: seed.collectionId,
          curatorId: ownerId,
          itemId: seed.itemAId,
          rankBucket: "top",
        });
        // score should be 0.875 (TIER_SEED.top)
        expect(body.preferences[0].score).toBeCloseTo(0.875, 3);

        // DB-state assertion: the row is PERSISTED, not just in the response
        const after = await prefRepo.findByCollection(seed.collectionId, ownerId);
        expect(after).toHaveLength(1);
        expect(after[0]).toMatchObject({
          collectionId: seed.collectionId,
          curatorId: ownerId,
          itemId: seed.itemAId,
          rankBucket: "top",
        });
        expect(after[0].score).toBeCloseTo(0.875, 3);
      });

      it("(8) recalculate UPDATES existing preference rows when called again after new decisions", async () => {
        // Seed: owner has one triage event (itemA → 'top') already from seedFullCollection.
        // Add a second triage event (itemB → 'low') to the same session, then recalc.
        // Both items must appear in the DB result; itemA stays 'top', itemB is 'low'.
        const seed = await seedFullCollection(ownerId);
        const { db } = getTestDb();

        // Add a triage decision for itemB on the existing session
        await new DecisionEventRepository(db).create({
          sessionId: seed.sessionId,
          type: "triage",
          decision: { itemId: seed.itemBId, result: "low" },
        });

        mockGetSession.mockResolvedValue({ user: { id: ownerId } });

        const res = await recalculate(makePostReq(seed.collectionId) as any, {
          params: { id: seed.collectionId },
        });
        expect(res.status).toBe(200);

        const prefRepo = new CollectionPreferenceItemRepository(db);
        const after = await prefRepo.findByCollection(seed.collectionId, ownerId);
        expect(after).toHaveLength(2);

        const prefA = after.find((p) => p.itemId === seed.itemAId);
        const prefB = after.find((p) => p.itemId === seed.itemBId);
        expect(prefA).toBeDefined();
        expect(prefB).toBeDefined();
        expect(prefA!.rankBucket).toBe("top");
        expect(prefA!.score).toBeCloseTo(0.875, 3);
        expect(prefB!.rankBucket).toBe("low");
        expect(prefB!.score).toBeCloseTo(0.125, 3);

        // Call again — idempotent UPDATE path (rows already exist)
        const res2 = await recalculate(makePostReq(seed.collectionId) as any, {
          params: { id: seed.collectionId },
        });
        expect(res2.status).toBe(200);
        const after2 = await prefRepo.findByCollection(seed.collectionId, ownerId);
        expect(after2).toHaveLength(2);
        const prefA2 = after2.find((p) => p.itemId === seed.itemAId);
        expect(prefA2!.rankBucket).toBe("top");
      });

      it("(9) recalculate with no decision events leaves pre-existing preference rows untouched", async () => {
        // memberId has no sessions/decisions. computePreferences returns [] so the
        // upsert loop is a no-op. The route then calls findByCollection which returns
        // the pre-seeded row — unchanged. Proves the recalc does not clobber existing
        // data when there are no decisions to process.
        const seed = await seedFullCollection(ownerId);
        mockGetSession.mockResolvedValue({ user: { id: seed.memberId } });

        const { db } = getTestDb();
        const prefRepo = new CollectionPreferenceItemRepository(db);

        const res = await recalculate(makePostReq(seed.collectionId) as any, {
          params: { id: seed.collectionId },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        // No decisions → computePreferences returns [] → no upserts → findByCollection
        // returns the pre-existing seeded row (unchanged by this recalc).
        expect(body.preferences).toHaveLength(1);
        expect(body.preferences[0]).toMatchObject({
          curatorId: seed.memberId,
          itemId: seed.itemBId,
          rankBucket: "medium",
        });

        // DB-state: the pre-seeded pref row is untouched
        const after = await prefRepo.findByCollection(seed.collectionId, seed.memberId);
        expect(after).toHaveLength(1);
        expect(after[0].rankBucket).toBe("medium");
      });

      it("(10) recalculate absent collection — 200 + empty (AUTH GAP pv9: no existence guard)", async () => {
        // AUTH GAP (pv9): no collection-existence/membership check on POST recalculate.
        // ScoringService.computePreferences calls sessionRepo.findByCollection which
        // returns [] for a missing collection → empty preferences → 200. Pin behavior.
        mockGetSession.mockResolvedValue({ user: { id: ownerId } });

        const res = await recalculate(makePostReq("col-absent-xyz") as any, {
          params: { id: "col-absent-xyz" },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.preferences).toHaveLength(0);
      });

      it("(11) member adds their own session+decisions and recalculate scopes to their curator id", async () => {
        // Confirm that a member who adds their own session sees only their own prefs,
        // not the owner's, proving curator-id scoping in the recalc path.
        const seed = await seedFullCollection(ownerId);
        const { db } = getTestDb();

        // Add a session for memberId + a triage decision
        const memberSession = await new SessionRepository(db).create({
          collectionId: seed.collectionId,
          curatorId: seed.memberId,
        });
        await new DecisionEventRepository(db).create({
          sessionId: memberSession.id,
          type: "triage",
          decision: { itemId: seed.itemAId, result: "high" },
        });

        mockGetSession.mockResolvedValue({ user: { id: seed.memberId } });

        const res = await recalculate(makePostReq(seed.collectionId) as any, {
          params: { id: seed.collectionId },
        });
        expect(res.status).toBe(200);
        const body = await res.json();

        // memberId's recalc computed 1 new row (itemA → high) and the route returns
        // ALL of memberId's rows via findByCollection, which includes the pre-seeded
        // row on itemB (medium) too — so 2 total.
        expect(body.preferences).toHaveLength(2);
        expect(body.preferences.every((p: { curatorId: string }) => p.curatorId === seed.memberId)).toBe(true);

        const newPref = body.preferences.find((p: { itemId: string }) => p.itemId === seed.itemAId);
        expect(newPref).toBeDefined();
        expect(newPref.rankBucket).toBe("high");

        const existingPref = body.preferences.find((p: { itemId: string }) => p.itemId === seed.itemBId);
        expect(existingPref).toBeDefined();
        expect(existingPref.rankBucket).toBe("medium");

        // Owner's preference set remains empty (scoping proof)
        const prefRepo = new CollectionPreferenceItemRepository(db);
        const ownerPrefs = await prefRepo.findByCollection(seed.collectionId, ownerId);
        expect(ownerPrefs).toHaveLength(0);
      });
    });
  },
);
