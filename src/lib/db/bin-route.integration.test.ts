// Real-DB integration proof for the manual bin-overlay route (purses-xxo7):
//   PUT /api/items/[id]/bin   { bucket: "top"|"high"|"medium"|"low" | null }
//
// The load-bearing crossings, proven un-mocked (route -> repo/tx -> pg):
//   (a) hand-bin on an item with NO preference row → a row is seeded (tier score +
//       overlay + rankBucket = bucket, comparisonCount 0).
//   (b) a real recompute AFTER a hand-bin preserves manual_bucket and overwrites the
//       derived columns — the invariant that a 1-of-4 label never triggers/loses to a
//       full recompute.
//   (c) clear on a HAND-ONLY row DELETEs it (no placeholder resurfaces); clear on a
//       SORTED row nulls ONLY the overlay (derived rankBucket stays).
//   (d) hand-binning a set-aside item clears its disposition (disposed <=> untriaged).
//   (e) 401 / 403 (stranger) / 404 (absent item) — authz before any write.
//   (f) finalize after a bin-disagreement freezes the EFFECTIVE composition into the
//       snapshot's manual_bucket (decision 5).
//
// Mocks ONLY the two true boundaries: auth and getDb -> the test db.
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";
import { PreferenceController } from "@/server/api/preferences";
import { SortResultService } from "@/server/services/SortResultService";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { PUT as putBin } from "@/app/api/items/[id]/bin/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function binReq(itemId: string, body: unknown): Request {
  return new Request(`http://localhost/api/items/${itemId}/bin`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const call = (itemId: string, body: unknown) =>
  putBin(binReq(itemId, body) as never, { params: Promise.resolve({ id: itemId }) } as never);

// Trigger a real recompute so the item ends up with a SORTED preference row: a
// session + one triage event, then the un-mocked recalculatePreferences pipeline.
async function sortItemInto(
  collectionId: string,
  curatorId: string,
  itemId: string,
  result: "top" | "high" | "medium" | "low",
): Promise<void> {
  const { db } = getTestDb();
  const session = await new SessionRepository(db).create({ collectionId, curatorId });
  await new DecisionEventRepository(db).create({
    sessionId: session.id,
    type: "triage",
    decision: { itemId, result },
  });
  await PreferenceController.fromDb(db).recalculatePreferences(collectionId, curatorId);
}

describeDb("PUT /api/items/[id]/bin (route -> repo/tx -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  // ── (a) hand-bin, no prior row → seeded row + overlay ──────────────────────
  it("(a) hand-bin with no preference row seeds a row: tier score, rankBucket = bucket, overlay set, 0 comparisons", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Fresh" });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const prefRepo = new CollectionPreferenceItemRepository(db);
    expect(await prefRepo.findByItem(item.id, ownerId)).toBeNull(); // non-vacuous

    const res = await call(item.id, { bucket: "top" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ effectiveBucket: "top" });

    const row = await prefRepo.findByItem(item.id, ownerId);
    expect(row).not.toBeNull();
    expect(row!.manualBucket).toBe("top");
    expect(row!.rankBucket).toBe("top"); // placeholder = bucket
    expect(row!.comparisonCount).toBe(0);
    expect(row!.orderRank).toBeNull();
    expect(row!.score).toBeCloseTo(0.875, 4); // TIER_SEED.top
  });

  // ── (b) recompute AFTER a hand-bin: overlay survives, derived cols overwritten ─
  it("(b) a real recompute preserves manual_bucket and overwrites the derived columns", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Rebinned" });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Hand-bin to top (placeholder rankBucket=top, count 0).
    await call(item.id, { bucket: "top" });
    // Now really sort it as "low" — the derived rankBucket must move to low, the
    // overlay must survive (bulkUpsert's conflict-SET omits manual_bucket).
    await sortItemInto(collectionId, ownerId, item.id, "low");

    const row = await new CollectionPreferenceItemRepository(db).findByItem(item.id, ownerId);
    expect(row!.manualBucket).toBe("top"); // overlay SURVIVED the recompute
    expect(row!.rankBucket).toBe("low"); // derived column OVERWRITTEN
    expect(row!.comparisonCount).toBe(1); // triage evidence counted
    expect(row!.score).toBeCloseTo(0.125, 4); // TIER_SEED.low
  });

  // ── (c) clear: hand-only DELETEs, sorted nulls-only ────────────────────────
  it("(c) clear deletes a hand-only row but only nulls the overlay on a sorted row", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const prefRepo = new CollectionPreferenceItemRepository(db);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Hand-only row → clear DELETEs it (placeholder rankBucket must not resurface).
    const handOnly = await new ItemRepository(db).create({ collectionId, name: "Hand only" });
    await call(handOnly.id, { bucket: "high" });
    const clearedHandOnly = await call(handOnly.id, { bucket: null });
    expect(clearedHandOnly.status).toBe(200);
    expect(await clearedHandOnly.json()).toEqual({ effectiveBucket: null });
    expect(await prefRepo.findByItem(handOnly.id, ownerId)).toBeNull(); // row GONE

    // Sorted row with an overlay → clear nulls ONLY the overlay; row + derived stay.
    const sorted = await new ItemRepository(db).create({ collectionId, name: "Sorted" });
    await sortItemInto(collectionId, ownerId, sorted.id, "medium");
    await call(sorted.id, { bucket: "top" }); // overlay top on a medium-sorted row
    const clearedSorted = await call(sorted.id, { bucket: null });
    expect(clearedSorted.status).toBe(200);
    expect(await clearedSorted.json()).toEqual({ effectiveBucket: "medium" }); // falls back to derived
    const row = await prefRepo.findByItem(sorted.id, ownerId);
    expect(row).not.toBeNull(); // row SURVIVES
    expect(row!.manualBucket).toBeNull(); // overlay nulled
    expect(row!.rankBucket).toBe("medium"); // derived intact
    expect(row!.comparisonCount).toBe(1);
  });

  // ── (d) hand-binning a set-aside item clears its disposition ───────────────
  it("(d) hand-binning a set-aside item clears the disposition (disposed <=> untriaged)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Set aside" });
    const dispRepo = new ItemDispositionRepository(db);
    await dispRepo.upsert({ collectionId, curatorId: ownerId, itemId: item.id, disposition: "set_aside" });
    expect(await dispRepo.findByItem(item.id, ownerId)).not.toBeNull(); // non-vacuous

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await call(item.id, { bucket: "top" });
    expect(res.status).toBe(200);

    // The placement created a preference row AND cleared the disposition.
    expect(await new CollectionPreferenceItemRepository(db).findByItem(item.id, ownerId)).not.toBeNull();
    expect(await dispRepo.findByItem(item.id, ownerId)).toBeNull();
  });

  // ── (e) authz: 401 / 403 / 404 before any write ────────────────────────────
  it("(e) 401 unauthenticated, 403 stranger, 404 absent item — and no row written", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Guarded" });
    const prefRepo = new CollectionPreferenceItemRepository(db);

    // 401 — no session.
    mockGetSession.mockResolvedValue(null);
    expect((await call(item.id, { bucket: "top" })).status).toBe(401);

    // 403 — a stranger (authenticated non-member) resolves the item then fails the
    // collection capability gate.
    const stranger = await seedUserRow("bin-stranger");
    mockGetSession.mockResolvedValue({ user: { id: stranger } });
    expect((await call(item.id, { bucket: "top" })).status).toBe(403);

    // 404 — absent item id (item-capability resolves the item first).
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    expect((await call("item_does_not_exist", { bucket: "top" })).status).toBe(404);

    // Nothing was written by any of the rejected calls.
    expect(await prefRepo.findByItem(item.id, ownerId)).toBeNull();
    expect(await prefRepo.findByItem(item.id, stranger)).toBeNull();
  });

  // ── (f) finalize freezes the EFFECTIVE composition into the snapshot ───────
  it("(f) finalize after a bin-disagreement carries the overlay into the snapshot (effective frozen)", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId, name: "Frozen" });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Sort the item as low, then hand-bin it to top (a real disagreement).
    await sortItemInto(collectionId, ownerId, item.id, "low");
    await call(item.id, { bucket: "top" });

    // Materialize a draft from the live prefs and finalize it.
    const service = SortResultService.fromDb(db);
    const draft = await service.createDraftResult(collectionId, ownerId, "Standing");
    await service.finalizeResult(draft.id);

    const snapshot = await service.getResult(draft.id);
    const snapItem = snapshot!.items.find((i) => i.itemId === item.id)!;
    // The snapshot froze the EFFECTIVE composition: computed=low (raw), overlay=top.
    expect(snapItem.computedBucket).toBe("low");
    expect(snapItem.manualBucket).toBe("top");
  });
});
