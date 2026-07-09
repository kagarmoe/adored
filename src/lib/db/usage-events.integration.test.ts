// Real-DB integration proof for the ONE definition of "the curator's decision
// log" (Epic R PR 1, spec §2.6):
//   loadCuratorDecisionEvents(sessionRepo, decisionRepo, collection, curator)
//   DecisionController.listForCurator(collection, curator)  → same helper
//
// Usage is a per-curator, WHOLE-LOG fact (D3 latest-wins, D7 multi-device): an
// item answered in session 1 must never be re-asked by session 2's queue. These
// cases pin: per-curator isolation, cross-session accumulation, and that the
// controller read and the recompute's read resolve to the SAME event set.
//
// Seeds directly via SessionRepository/ItemRepository/DecisionEventRepository
// (no route import needed — this is a controller/helper-level seam). getDb is
// mocked to the test pool so any transitive @/lib/db import is inert.
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { sessionsTable } from "@/lib/db/schema";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { DecisionController } from "@/server/api/decisions";
import { loadCuratorDecisionEvents } from "@/server/services/decision-log";
import { deriveUsage } from "@/lib/derive-usage";
import type { UsageResult } from "@/types";

vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("the curator's decision log (loadCuratorDecisionEvents / listForCurator)", () => {
  let curatorA: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    curatorA = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  // ── seeding helpers ───────────────────────────────────────────────────────
  function repos() {
    const { db } = getTestDb();
    return {
      db,
      sessionRepo: new SessionRepository(db),
      itemRepo: new ItemRepository(db),
      decisionRepo: new DecisionEventRepository(db),
    };
  }

  async function seedItem(collectionId: string, name: string) {
    return repos().itemRepo.create({ collectionId, name });
  }

  async function seedSession(collectionId: string, curatorId: string) {
    return repos().sessionRepo.create({ collectionId, curatorId });
  }

  async function completeSession(sessionId: string) {
    // Free the (collection, curator) partial-index slot so the SAME curator can
    // open a second session in the SAME collection — completed rows are still
    // read by findByCollectionAndCurator (deletedAt IS NULL).
    const { db } = getTestDb();
    await db.update(sessionsTable).set({ status: "completed" }).where(eq(sessionsTable.id, sessionId));
  }

  async function seedUsage(sessionId: string, itemId: string, result: UsageResult) {
    return repos().decisionRepo.create({
      sessionId,
      type: "usage",
      decision: { itemId, result },
    });
  }

  async function seedTriage(sessionId: string, itemId: string, result: "top" | "high" | "medium" | "low") {
    return repos().decisionRepo.create({
      sessionId,
      type: "triage",
      decision: { itemId, result },
    });
  }

  const idSet = (events: { id: string }[]) => new Set(events.map((e) => e.id));

  // ── Per-curator isolation ─────────────────────────────────────────────────
  it("listForCurator returns ONLY the queried curator's events; deriveUsage never leaks the other curator's items", async () => {
    const { db } = repos();
    const collectionId = await seedBareCollection(curatorA);
    const curatorB = await seedUserRow("curatorB");

    const itemA = await seedItem(collectionId, "A's bag");
    const itemB = await seedItem(collectionId, "B's bag");

    const sessionA = await seedSession(collectionId, curatorA);
    const sessionB = await seedSession(collectionId, curatorB);
    const evtA = await seedUsage(sessionA.id, itemA.id, "uses");
    const evtB = await seedUsage(sessionB.id, itemB.id, "uses");

    const controller = DecisionController.fromDb(db);
    const forA = await controller.listForCurator(collectionId, curatorA);
    const forB = await controller.listForCurator(collectionId, curatorB);

    expect(idSet(forA)).toEqual(new Set([evtA.id]));
    expect(idSet(forB)).toEqual(new Set([evtB.id]));

    // deriveUsage over A's log knows A's item, never B's.
    const liveIds = new Set([itemA.id, itemB.id]);
    const usageA = deriveUsage(forA, liveIds);
    expect(usageA.has(itemA.id)).toBe(true);
    expect(usageA.has(itemB.id)).toBe(false);
  });

  // ── Cross-session accumulation ────────────────────────────────────────────
  it("a usage answer in session 1 is visible in listForCurator after session 2 opens; deriveUsage marks it known", async () => {
    const { db } = repos();
    const collectionId = await seedBareCollection(curatorA);
    const item = await seedItem(collectionId, "The bag");

    const session1 = await seedSession(collectionId, curatorA);
    const usageEvt = await seedUsage(session1.id, item.id, "uses");
    // Session 1 must be terminal before session 2 can open in the same slot.
    await completeSession(session1.id);
    const session2 = await seedSession(collectionId, curatorA);
    expect(session2.id).not.toBe(session1.id);

    const log = await DecisionController.fromDb(db).listForCurator(collectionId, curatorA);
    expect(idSet(log)).toContain(usageEvt.id);

    // The item is usage-known from the cross-session log — a session-2 queue
    // that filters on this would exclude it (composition proven in Task 12).
    const usage = deriveUsage(log, new Set([item.id]));
    expect(usage.get(item.id)).toBe("uses");
  });

  // ── Same log as the recompute (behavioral id-set comparison) ──────────────
  it("listForCurator resolves to exactly the event set loadCuratorDecisionEvents loads for the recompute", async () => {
    const { db, sessionRepo, decisionRepo } = repos();
    const collectionId = await seedBareCollection(curatorA);
    const item1 = await seedItem(collectionId, "Bag 1");
    const item2 = await seedItem(collectionId, "Bag 2");

    // Two sessions (session 1 completed, session 2 active) — the helper must
    // flatten across both; a session-scoped read would miss one.
    const session1 = await seedSession(collectionId, curatorA);
    const e1 = await seedTriage(session1.id, item1.id, "top");
    await completeSession(session1.id);
    const session2 = await seedSession(collectionId, curatorA);
    const e2 = await seedTriage(session2.id, item2.id, "high");

    const expected = new Set([e1.id, e2.id]);

    // The controller (round page) read.
    const viaController = await DecisionController.fromDb(db).listForCurator(collectionId, curatorA);
    // The SAME helper PreferenceStateService.loadDecisionEvents now delegates to
    // (the recompute's read) — identical entry point, proven behaviorally.
    const viaHelper = await loadCuratorDecisionEvents(sessionRepo, decisionRepo, collectionId, curatorA);

    expect(idSet(viaController)).toEqual(expected);
    expect(idSet(viaHelper)).toEqual(expected);
    expect(idSet(viaController)).toEqual(idSet(viaHelper));
  });
});
