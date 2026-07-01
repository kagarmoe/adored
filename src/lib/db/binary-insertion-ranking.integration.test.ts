// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getTestDb, resetDb, closeDb } from "@/../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedFullCollection } from "@/../e2e/fixtures/seed";
import { mockAuth } from "@/../e2e/fixtures/mock-auth";
import { generateId } from "@/lib/id";
import type { Database } from "@/lib/db";
import type { PairwiseResult, TriageResult } from "@/types";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { PreferenceController } from "@/server/api/preferences";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { POST as postDecisionRoute } from "@/app/api/sessions/[id]/decisions/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function decisionReq(sessionId: string, body: unknown): Request {
  return new Request(`http://localhost/api/sessions/${sessionId}/decisions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postDecision(sessionId: string, body: unknown): Promise<Response> {
  return (await postDecisionRoute(
    decisionReq(sessionId, body) as never,
    { params: { id: sessionId } } as never,
  )) as unknown as Response;
}

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

// Task 7: recalculatePreferences runs the pure binary-insertion engine over the
// curator's pairwise comparisons and assigns a dense order_rank (0 = most loved)
// to the top/high (Love+Like) items. Real seam, no mocks beyond the DB boundary:
// two items triaged into the SAME tier, one pairwise deciding the order, then the
// materialized preference rows are re-read and their order_rank asserted.
//
// Local recordTriage/recordPairwise INSERT real decision_events rows (id via
// generateId, type + decision jsonb matching TriageDecision / PairwiseDecision).
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

describeDb("recalculate assigns orderRank to top+high via insertion", () => {
  beforeAll(async () => { await resetDb(); });
  afterAll(async () => { await closeDb(); });

  it("orders two loved items by their pairwise comparison", async () => {
    const { db } = getTestDb();
    const ownerId = await seedBaseline();
    const collectionId = await seedBareCollection(ownerId);

    const itemRepo = new ItemRepository(db);
    const a = await itemRepo.create({ collectionId });
    const b = await itemRepo.create({ collectionId });
    const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });

    // Both triaged "top" (co-bucketed, same score); one pairwise: B more loved than A.
    await recordTriage(db, session.id, a.id, "top");
    await recordTriage(db, session.id, b.id, "top");
    await recordPairwise(db, session.id, a.id, b.id, "item_b"); // B > A

    await PreferenceController.fromDb(db).recalculatePreferences(collectionId, ownerId);

    const prefs = await new CollectionPreferenceItemRepository(db).findByCollection(
      collectionId,
      ownerId,
    );
    const rankOf = (id: string) => prefs.find((p) => p.itemId === id)!.orderRank;

    // B is more loved => slot 0; A => slot 1.
    expect(rankOf(b.id)).toBe(0);
    expect(rankOf(a.id)).toBe(1);
  });
});

// Task 9: the decisions route is idempotent on a repeated clientKey. Retrying the
// SAME (sessionId, clientKey) must return the ORIGINAL event (200), not insert a
// second row or 500 on the partial unique violation. Real seam: route -> repos ->
// pg; only auth + getDb are mocked (curator drives the session).
describeDb("decisions route — idempotency on clientKey (route -> repo -> DB)", () => {
  let ownerId: string;
  let sessionId: string;
  let itemId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
    const collectionId = await seedBareCollection(ownerId);
    itemId = (await new ItemRepository(getTestDb().db).create({ collectionId, name: "Bag" })).id;
    sessionId = (await new SessionRepository(getTestDb().db).create({ collectionId, curatorId: ownerId })).id;
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
  });

  afterAll(async () => { await closeDb(); });

  it("is idempotent on a repeated clientKey (retry → same event, one row, <300)", async () => {
    const first = await postDecision(sessionId, {
      type: "triage",
      decision: { itemId, result: "top" },
      clientKey: "k1",
    });
    const second = await postDecision(sessionId, {
      type: "triage",
      decision: { itemId, result: "top" },
      clientKey: "k1",
    });

    expect(first.status).toBe(201);
    expect(second.status).toBeLessThan(300);

    const body1 = (await first.json()) as { id: string };
    const body2 = (await second.json()) as { id: string };
    expect(body2.id).toBe(body1.id); // same event, not a new one

    const { db } = getTestDb();
    const rows = await db.execute(
      sql`select count(*)::int as n from decision_events where session_id = ${sessionId}`,
    );
    expect((rows[0] as { n: number }).n).toBe(1);
  });

  it("a decision WITHOUT a clientKey still inserts normally (NULL exempt from the unique index)", async () => {
    const a = await postDecision(sessionId, { type: "triage", decision: { itemId, result: "top" } });
    const b = await postDecision(sessionId, { type: "triage", decision: { itemId, result: "top" } });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const { db } = getTestDb();
    const rows = await db.execute(
      sql`select count(*)::int as n from decision_events where session_id = ${sessionId}`,
    );
    expect((rows[0] as { n: number }).n).toBe(2);
  });
});

// Read the ACTUAL shipped migration and return its executable statements: split on
// drizzle's `--> statement-breakpoint` marker, drop `--` comment lines, and keep the
// non-empty remainder. The reset test runs THESE (not a hand-copied duplicate), so it
// verifies the real migration content — if someone edits the DELETEs, this test moves
// with them.
function shippedMigrationStatements(file: string): string[] {
  const raw = readFileSync(join(process.cwd(), "drizzle", file), "utf8");
  return raw
    .split("--> statement-breakpoint")
    .map((stmt) =>
      stmt
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((stmt) => stmt.length > 0);
}

// Task 11: the forward-only clean reset (drizzle/0012_reset_elo_drafts.sql) discards
// Elo-era DRAFT sort results (whose computedRank derives from the retired scoring) and
// their items, while leaving FINALIZED results — immutable self-contained snapshots —
// untouched. A count on a freshly-migrated (empty) DB would be trivially 0 and prove
// nothing; this seeds BOTH a draft and a finalized result (each with an item row),
// executes the SHIPPED migration's statements (read from the .sql file), and asserts
// the draft + its item are gone while the finalized result + its item remain.
describeDb("clean reset — discards Elo-era drafts, preserves finalized snapshots", () => {
  beforeAll(async () => { await resetDb(); });
  afterAll(async () => { await closeDb(); });

  async function seedResult(
    db: Database,
    collectionId: string,
    curatorId: string,
    itemId: string,
    status: "draft" | "finalized",
  ): Promise<{ resultId: string; resultItemId: string }> {
    const resultId = generateId("sr");
    const resultItemId = generateId("sri");
    await db.execute(sql`
      INSERT INTO sort_results (id, collection_id, curator_id, status, name, created_at, updated_at)
      VALUES (${resultId}, ${collectionId}, ${curatorId}, ${status}, ${status + " result"}, now(), now())`);
    await db.execute(sql`
      INSERT INTO sort_result_items (id, sort_result_id, item_id, computed_rank, computed_bucket, created_at, updated_at)
      VALUES (${resultItemId}, ${resultId}, ${itemId}, 0, 'top', now(), now())`);
    return { resultId, resultItemId };
  }

  async function countById(db: Database, table: "sort_results" | "sort_result_items", id: string): Promise<number> {
    const rows = await db.execute(
      sql`select count(*)::int as n from ${sql.raw(table)} where id = ${id}`,
    );
    return (rows[0] as { n: number }).n;
  }

  it("removes draft results + their items, keeps finalized results + their items", async () => {
    const { db } = getTestDb();
    const ownerId = await seedBaseline();
    const collectionId = await seedBareCollection(ownerId);
    const item = await new ItemRepository(db).create({ collectionId });

    const draft = await seedResult(db, collectionId, ownerId, item.id, "draft");
    const finalized = await seedResult(db, collectionId, ownerId, item.id, "finalized");

    // Sanity: both present before the reset (otherwise the assertions below are vacuous).
    expect(await countById(db, "sort_results", draft.resultId)).toBe(1);
    expect(await countById(db, "sort_results", finalized.resultId)).toBe(1);

    // Run the ACTUAL shipped migration's statements (read from the .sql file, not a
    // hand-copied duplicate) so this test verifies the real reset content.
    const statements = shippedMigrationStatements("0012_reset_elo_drafts.sql");
    expect(statements.length).toBe(2); // items DELETE, then results DELETE
    for (const stmt of statements) {
      await db.execute(sql.raw(stmt));
    }

    // Draft result + its item are gone.
    expect(await countById(db, "sort_results", draft.resultId)).toBe(0);
    expect(await countById(db, "sort_result_items", draft.resultItemId)).toBe(0);

    // Finalized result + its item remain.
    expect(await countById(db, "sort_results", finalized.resultId)).toBe(1);
    expect(await countById(db, "sort_result_items", finalized.resultItemId)).toBe(1);
  });
});

// Task 11: the dead PairingService (a class-method selector superseded by the live
// free function in src/lib/pairwise-selection.ts) is deleted. This guard fails if the
// module is ever reintroduced — importing a nonexistent module rejects.
describe("PairingService is deleted (no importers)", () => {
  it("cannot be imported", async () => {
    await expect(import("@/server/services/PairingService")).rejects.toBeTruthy();
  });
});
