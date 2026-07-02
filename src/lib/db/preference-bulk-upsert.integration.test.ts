// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb, resetDb, closeDb } from "@/../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "@/../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import type { Database } from "@/lib/db";
import type { PairwiseResult, TriageResult } from "@/types";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { PreferenceController } from "@/server/api/preferences";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

async function recordTriage(
  db: Database,
  sessionId: string,
  itemId: string,
  result: TriageResult,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO decision_events (id, session_id, type, decision, created_at)
    VALUES (
      ${generateId("evt")}, ${sessionId}, 'triage',
      ${JSON.stringify({ itemId, result })}::jsonb, now()
    )`);
}

async function recordPairwise(
  db: Database,
  sessionId: string,
  itemAId: string,
  itemBId: string,
  result: PairwiseResult,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO decision_events (id, session_id, type, decision, created_at)
    VALUES (
      ${generateId("evt")}, ${sessionId}, 'pairwise_compare',
      ${JSON.stringify({ itemAId, itemBId, result })}::jsonb, now()
    )`);
}

// The bulk recompute must survive a PERMUTATION of order_rank without tripping the
// partial unique index preferences_order_rank_unique. The old two-phase clear-then-
// assign dodged this by nulling first; the bulk version must preserve that safety
// (null all ranks in ONE statement, THEN upsert DISTINCT ranks in ONE statement).
// This is the KEY test proving the bulk SQL shape is Postgres-safe.
describeDb("recalculate — bulk recompute permutes order_rank with NO unique violation", () => {
  beforeEach(async () => { await resetDb(); });
  afterAll(async () => { await closeDb(); });

  it("reordering three loved items yields dense 0,1,2 ranks and no 23505", async () => {
    const { db } = getTestDb();
    const ownerId = await seedBaseline();
    const collectionId = await seedBareCollection(ownerId);
    const itemRepo = new ItemRepository(db);
    const a = await itemRepo.create({ collectionId });
    const b = await itemRepo.create({ collectionId });
    const c = await itemRepo.create({ collectionId });
    const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });

    // All three "top". First establish an initial order via comparisons: A>B>C.
    await recordTriage(db, session.id, a.id, "top");
    await recordTriage(db, session.id, b.id, "top");
    await recordTriage(db, session.id, c.id, "top");
    await recordPairwise(db, session.id, a.id, b.id, "item_a"); // A > B
    await recordPairwise(db, session.id, b.id, c.id, "item_a"); // B > C  => order A>B>C

    await PreferenceController.fromDb(db).recalculatePreferences(collectionId, ownerId);

    const repo = new CollectionPreferenceItemRepository(db);
    const first = await repo.findByCollection(collectionId, ownerId);
    // Every ranked slot is distinct and dense (0..n-1) — the invariant we protect.
    const ranks1 = first.map((p) => p.orderRank).filter((r): r is number => r !== null).sort((x, y) => x - y);
    expect(ranks1).toEqual([0, 1, 2]);

    // Now PERMUTE: add comparisons that flip the order (C becomes most loved).
    // This forces the recompute to REASSIGN existing non-null ranks — the exact
    // scenario that trips a naive single-statement permutation on the unique index.
    await recordPairwise(db, session.id, c.id, a.id, "item_a"); // C > A
    await recordPairwise(db, session.id, c.id, b.id, "item_a"); // C > B

    // Must NOT throw a 23505 unique violation.
    await expect(
      PreferenceController.fromDb(db).recalculatePreferences(collectionId, ownerId),
    ).resolves.toBeDefined();

    const second = await repo.findByCollection(collectionId, ownerId);
    const ranks2 = second.map((p) => p.orderRank).filter((r): r is number => r !== null).sort((x, y) => x - y);
    expect(ranks2).toEqual([0, 1, 2]); // still dense + distinct after the permutation
    // C is now most loved => slot 0.
    expect(second.find((p) => p.itemId === c.id)!.orderRank).toBe(0);
  });

  // Determinism: running the SAME log through recompute TWICE yields byte-identical
  // materialized state (buckets + orderRank + comparisonCount). The bulk path must
  // not change the computed values — only how they're written.
  it("is deterministic — a second recompute of the same log is byte-identical", async () => {
    const { db } = getTestDb();
    const ownerId = await seedBaseline();
    const collectionId = await seedBareCollection(ownerId);
    const itemRepo = new ItemRepository(db);
    const a = await itemRepo.create({ collectionId });
    const b = await itemRepo.create({ collectionId });
    const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });

    await recordTriage(db, session.id, a.id, "top");
    await recordTriage(db, session.id, b.id, "top");
    await recordPairwise(db, session.id, a.id, b.id, "item_b"); // B > A

    const controller = PreferenceController.fromDb(db);
    await controller.recalculatePreferences(collectionId, ownerId);
    const repo = new CollectionPreferenceItemRepository(db);
    const snap = (rows: Awaited<ReturnType<typeof repo.findByCollection>>) =>
      rows
        .map((p) => ({
          itemId: p.itemId,
          score: p.score,
          confidence: p.confidence,
          rankBucket: p.rankBucket,
          comparisonCount: p.comparisonCount,
          orderRank: p.orderRank,
        }))
        .sort((x, y) => x.itemId.localeCompare(y.itemId));

    const before = snap(await repo.findByCollection(collectionId, ownerId));
    await controller.recalculatePreferences(collectionId, ownerId);
    const after = snap(await repo.findByCollection(collectionId, ownerId));
    expect(after).toEqual(before);
  });

  // The bulk path replaces the per-row loop: the repo's per-row `update` must NOT be
  // called P times. We spy on the OLD per-row method and assert the recompute drives
  // the new bulk method instead (called once for the write).
  it("uses the bulk write path, not the per-row update loop", async () => {
    const { db } = getTestDb();
    const ownerId = await seedBaseline();
    const collectionId = await seedBareCollection(ownerId);
    const itemRepo = new ItemRepository(db);
    const a = await itemRepo.create({ collectionId });
    const b = await itemRepo.create({ collectionId });
    const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    await recordTriage(db, session.id, a.id, "top");
    await recordTriage(db, session.id, b.id, "top");
    await recordPairwise(db, session.id, a.id, b.id, "item_b");

    const perRowUpdate = vi.spyOn(CollectionPreferenceItemRepository.prototype, "update");
    const bulkUpsert = vi.spyOn(CollectionPreferenceItemRepository.prototype, "bulkUpsert");

    await PreferenceController.fromDb(db).recalculatePreferences(collectionId, ownerId);

    expect(perRowUpdate).not.toHaveBeenCalled();
    expect(bulkUpsert).toHaveBeenCalledTimes(1);
    perRowUpdate.mockRestore();
    bulkUpsert.mockRestore();
  });
});
