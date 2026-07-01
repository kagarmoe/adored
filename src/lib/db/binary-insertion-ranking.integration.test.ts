import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb, resetDb, closeDb } from "@/../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedFullCollection } from "@/../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Run `fn` and return the Postgres error `code` it throws (e.g. "23505"), or
 *  null if it didn't throw. Asserting on the code — not message text — is the
 *  repo convention for unique-violation tests (see session-*-conflict specs). */
async function pgErrorCode(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return (err as { code?: string } & { cause?: { code?: string } }).code
      ?? (err as { cause?: { code?: string } }).cause?.code
      ?? null;
  }
}

describeDb("binary-insertion ranking — schema", () => {
  beforeAll(async () => { await resetDb(); });
  afterAll(async () => { await closeDb(); });

  it("preferences has a nullable order_rank column", async () => {
    const { db } = getTestDb();
    const rows = await db.execute(sql`
      select column_name, is_nullable from information_schema.columns
      where table_name = 'preferences' and column_name = 'order_rank'`);
    expect(rows.length).toBe(1);
    expect((rows[0] as { is_nullable: string }).is_nullable).toBe("YES");
  });

  it("decision_events has a nullable client_key column", async () => {
    const { db } = getTestDb();
    const rows = await db.execute(sql`
      select column_name, is_nullable from information_schema.columns
      where table_name = 'decision_events' and column_name = 'client_key'`);
    expect(rows.length).toBe(1);
    expect((rows[0] as { is_nullable: string }).is_nullable).toBe("YES");
  });

  it("enforces the partial unique index on (session_id, client_key)", async () => {
    const { db } = getTestDb();
    const rows = await db.execute(sql`
      select indexname from pg_indexes
      where tablename = 'decision_events' and indexname = 'decision_events_client_key_unique'`);
    expect(rows.length).toBe(1);
  });

  // The ONLY honest proof that these indexes are PARTIAL (not unconditional uniques)
  // is the predicate in pg_indexes.indexdef. Behavioral insert/reject tests cannot
  // distinguish partial from unconditional under Postgres' default NULLS DISTINCT.
  it("decision_events_client_key_unique is PARTIAL on client_key IS NOT NULL", async () => {
    const { db } = getTestDb();
    const rows = await db.execute(sql`
      select indexdef from pg_indexes where indexname = 'decision_events_client_key_unique'`);
    expect(rows.length).toBe(1);
    expect((rows[0] as { indexdef: string }).indexdef).toContain("client_key IS NOT NULL");
  });

  it("preferences_order_rank_unique is PARTIAL on order_rank IS NOT NULL", async () => {
    const { db } = getTestDb();
    const rows = await db.execute(sql`
      select indexdef from pg_indexes where indexname = 'preferences_order_rank_unique'`);
    expect(rows.length).toBe(1);
    expect((rows[0] as { indexdef: string }).indexdef).toContain("order_rank IS NOT NULL");
  });
});

// These behavioral cases prove that *a* unique constraint enforces uniqueness on the
// non-null tuples and permits NULLs. They do NOT, on their own, prove the index is
// PARTIAL: under Postgres' default NULLS DISTINCT, an UNCONDITIONAL unique on these
// columns is behaviorally identical here — it also permits duplicate NULLs — so
// insert/reject alone cannot distinguish partial from unconditional. The indexdef
// assertions above (pg_indexes.indexdef contains `WHERE (... IS NOT NULL)`) are what
// prove the predicate is partial. Rejection is asserted on the Postgres error code
// 23505, not message text.
describeDb("decision_events partial unique — (session_id, client_key) WHERE client_key IS NOT NULL", () => {
  let sessionId: string;

  beforeAll(async () => {
    await resetDb();
    const ownerId = await seedBaseline();
    const collectionId = await seedBareCollection(ownerId);
    const session = await new SessionRepository(getTestDb().db).create({
      collectionId,
      curatorId: ownerId,
    });
    sessionId = session.id;
  });
  afterAll(async () => { await closeDb(); });

  async function insertEvent(clientKey: string | null): Promise<void> {
    const { db } = getTestDb();
    await db.execute(sql`
      INSERT INTO decision_events (id, session_id, type, decision, client_key, created_at)
      VALUES (${generateId("dec")}, ${sessionId}, 'triage', ${sql.raw("'{}'::jsonb")}, ${clientKey}, now())`);
  }

  it("allows TWO events in the same session with client_key = NULL (partial index exempts NULLs)", async () => {
    await insertEvent(null);
    expect(await pgErrorCode(() => insertEvent(null))).toBeNull();
  });

  it("REJECTS a second event with the same (session_id, client_key='k1') on 23505", async () => {
    await insertEvent("k1");
    expect(await pgErrorCode(() => insertEvent("k1"))).toBe("23505");
  });
});

describeDb("preferences partial unique — (collection_id, curator_id, order_rank) WHERE order_rank IS NOT NULL", () => {
  let collectionId: string;
  let curatorId: string;

  beforeAll(async () => {
    await resetDb();
    curatorId = await seedBaseline();
    collectionId = await seedBareCollection(curatorId);
  });
  afterAll(async () => { await closeDb(); });

  // A fresh item per row: preferences_item_curator_unique (item_id, curator_id)
  // is UNCONDITIONAL, so two rows must use DIFFERENT items to isolate the
  // order_rank predicate we're actually testing here.
  async function insertPreference(orderRank: number | null): Promise<void> {
    const { db } = getTestDb();
    const itemId = await new ItemRepository(db).create({ collectionId }).then((i) => i.id);
    await db.execute(sql`
      INSERT INTO preferences
        (id, collection_id, curator_id, item_id, score, confidence, rank_bucket, comparison_count, order_rank, last_seen, created_at, updated_at)
      VALUES
        (${generateId("pref")}, ${collectionId}, ${curatorId}, ${itemId}, 0.5, 1, 'medium', 0, ${orderRank}, now(), now(), now())`);
  }

  it("allows TWO rows (same collection+curator, different items) with order_rank = NULL", async () => {
    await insertPreference(null);
    expect(await pgErrorCode(() => insertPreference(null))).toBeNull();
  });

  it("REJECTS two rows (different items) with the SAME non-null order_rank = 0 on 23505", async () => {
    await insertPreference(0);
    expect(await pgErrorCode(() => insertPreference(0))).toBe("23505");
  });
});

// The repository is the seam that persists/reads order_rank as a plain integer
// (no numeric-string coercion) and clears it in bulk for a curator's collection.
describeDb("preference orderRank persistence", () => {
  beforeAll(async () => { await resetDb(); });
  afterAll(async () => { await closeDb(); });

  it("round-trips orderRank and clears it in bulk", async () => {
    const { db } = getTestDb();
    // seedFullCollection(ownerId) returns FullSeedIds { collectionId, itemAId, itemBId, ... };
    // the owner (curatorId) has NO preference row seeded (the fixture's only pref is
    // the 2nd member's on itemB), so we create the owner's own row here.
    const curatorId = await seedBaseline();
    const { collectionId, itemAId } = await seedFullCollection(curatorId);
    const repo = new CollectionPreferenceItemRepository(db);

    await repo.create({
      collectionId,
      curatorId,
      itemId: itemAId,
      score: 0.9,
      confidence: 0.5,
      rankBucket: "top",
      comparisonCount: 1,
      orderRank: 0,
    });
    const one = await repo.findByItem(itemAId, curatorId);
    expect(one?.orderRank).toBe(0);

    await repo.clearOrderRanks(collectionId, curatorId);
    const cleared = await repo.findByItem(itemAId, curatorId);
    expect(cleared?.orderRank).toBeNull();
  });
});
