// @vitest-environment node
//
// Epic S PR S2 (spec §3): sort_result_items.usage is snapshotted AT draft
// materialization from the curator's LIVE usage fold, and RE-DERIVED fresh on a
// revision (§3.3 fresh-fold, never clone-carry). Un-mocked: SortResultService ->
// repos -> ephemeral Postgres. The ONLY mocked boundary is @/lib/db (so any
// transitive import is inert); the service is handed the test pool directly.
//
// These pin:
//   1. the migration applied — sort_result_items has a nullable `usage` text col;
//   2. materialization stamps each item's usage from the fold (unknown -> NULL);
//   3. a revision re-derives usage from the CURRENT log (fresh-fold) AND drops
//      the manual overlay — one test asserting both halves.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultService } from "@/server/services/SortResultService";
import type { UsageResult } from "@/types";

vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describeDb("sort_result_items.usage snapshot + fresh-fold revision (service -> repo -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });
  afterAll(async () => {
    await closeDb();
  });

  function service() {
    const { db } = getTestDb();
    return new SortResultService(
      new SortResultRepository(db),
      new SortResultItemRepository(db),
      new CollectionPreferenceItemRepository(db),
      db,
    );
  }

  /** Seed a top-bucket preference so the item lands in the materialized ranking. */
  async function seedRankedItem(collectionId: string, orderRank: number) {
    const { db } = getTestDb();
    const item = await new ItemRepository(db).create({ collectionId });
    await new CollectionPreferenceItemRepository(db).create({
      collectionId, curatorId: ownerId, itemId: item.id,
      score: 0.9, confidence: 1, rankBucket: "top", comparisonCount: 0, orderRank,
    });
    return item.id;
  }

  async function seedUsage(sessionId: string, itemId: string, result: UsageResult) {
    return new DecisionEventRepository(getTestDb().db).create({
      sessionId, type: "usage", decision: { itemId, result },
    });
  }

  const usageByItem = (items: { itemId: string; usage: UsageResult | null }[]) =>
    new Map(items.map((i) => [i.itemId, i.usage]));

  // ── 1. migration applied ────────────────────────────────────────────────────
  it("the migration added a nullable `usage` text column to sort_result_items", async () => {
    const { db } = getTestDb();
    const rows = await db.execute(sql`
      SELECT data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'sort_result_items' AND column_name = 'usage'
    `);
    // postgres-js returns an array-like of rows.
    const row = (rows as unknown as Array<{ data_type: string; is_nullable: string }>)[0];
    expect(row).toBeDefined();
    expect(row.data_type).toBe("text");
    expect(row.is_nullable).toBe("YES");
  });

  // ── 2. materialization stamps the live fold ─────────────────────────────────
  it("stamps each item's usage from the live fold at materialization; usage-unknown -> NULL", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const usesId = await seedRankedItem(collectionId, 0);
    const notUsesId = await seedRankedItem(collectionId, 1);
    const unknownId = await seedRankedItem(collectionId, 2); // no usage event → NULL

    const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    await seedUsage(session.id, usesId, "uses");
    await seedUsage(session.id, notUsesId, "not_uses");

    const result = await service().createDraftResult(collectionId, ownerId, "Snapshot");

    const items = await new SortResultItemRepository(db).findByResult(result.id);
    // Non-vacuous: all three ranked items materialized.
    expect(items).toHaveLength(3);
    const map = usageByItem(items);
    expect(map.get(usesId)).toBe("uses");
    expect(map.get(notUsesId)).toBe("not_uses");
    expect(map.get(unknownId)).toBeNull();
  });

  // ── 3. revision fresh-fold + manual overlay dropped ─────────────────────────
  it("a revision RE-DERIVES usage from the CURRENT log (fresh-fold) while dropping the manual overlay", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const itemA = await seedRankedItem(collectionId, 0);
    const itemB = await seedRankedItem(collectionId, 1);
    const itemRepo = new SortResultItemRepository(db);

    // ORIGINAL usage: A "uses", B undecided. Materialize + finalize the keepsake.
    const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    await seedUsage(session.id, itemA, "uses");
    const original = await service().createDraftResult(collectionId, ownerId, "Keepsake");

    // The original snapshot froze A as "uses", B as NULL.
    const originalItems = await itemRepo.findByResult(original.id);
    const originalMap = usageByItem(originalItems);
    expect(originalMap.get(itemA)).toBe("uses");
    expect(originalMap.get(itemB)).toBeNull();

    // Put a MANUAL overlay on the source row for A, then finalize (the overlay
    // must NOT survive the clone).
    const rowA = originalItems.find((i) => i.itemId === itemA)!;
    await itemRepo.update(rowA.id, { manualRank: 7, manualBucket: "low" });
    const overlaid = await itemRepo.findById(rowA.id);
    expect(overlaid!.manualRank).toBe(7);
    expect(overlaid!.manualBucket).toBe("low");
    await service().finalizeResult(original.id);

    // USAGE CHANGES after the keepsake: A flips to "not_uses", B becomes "uses".
    // sleep so the newer events sort strictly after the original (latest-wins).
    await sleep(5);
    await seedUsage(session.id, itemA, "not_uses");
    await seedUsage(session.id, itemB, "uses");

    // Supersede → a fresh "(Revision)" draft.
    const revision = await service().supersedeResult(original.id);
    expect(revision).not.toBeNull();

    const revisionItems = await itemRepo.findByResult(revision!.id);
    const revMap = usageByItem(revisionItems);
    // FRESH-FOLD: the revision records the CURRENT usage, not the frozen original.
    expect(revMap.get(itemA)).toBe("not_uses");
    expect(revMap.get(itemB)).toBe("uses");
    // The manual overlay was DROPPED by the clone (fresh computed order only).
    const revRowA = revisionItems.find((i) => i.itemId === itemA)!;
    expect(revRowA.manualRank).toBeNull();
    expect(revRowA.manualBucket).toBeNull();

    // The ORIGINAL keepsake is untouched — still frozen at "uses"/NULL.
    const frozen = usageByItem(await itemRepo.findByResult(original.id));
    expect(frozen.get(itemA)).toBe("uses");
    expect(frozen.get(itemB)).toBeNull();
  });
});
