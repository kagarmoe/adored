/**
 * bench-batch — single-POST vs batch decision-transaction amortization.
 *
 * Documents Epic P's win: 50 sequential single-route decision transactions
 * (each = advisory lock + 1 event insert + 1 full preference recompute, the
 * unit POST /api/sessions/[id]/decisions runs) vs ONE 50-entry batch
 * transaction (advisory lock + 50 monotonic-id inserts + ONE recompute, the
 * unit POST /api/sessions/[id]/decisions/batch runs). The printed per-decision
 * amortization informs the client flusher's 5-pending / 4 s / 50-chunk
 * thresholds (parent spec §7.3).
 *
 * Timing unit mirrors what the routes run — the same
 * `withTransaction(lockCollectionCurator → insert(s) → recalculatePreferences)`
 * block, built from the same controller path `seed-load-core` already times.
 * It is a measurement tool, not a gate: it always writes to a fresh LOCAL DB
 * and exits non-zero only on harness failure.
 *
 * SAFETY — LOCAL DB ONLY (same guard as seed-load): `resolveLocalUrl` refuses
 * any non-localhost host. This script TRUNCATEs, so it must never touch a
 * remote/prod (e.g. Neon) database.
 *
 * USAGE:
 *   DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test \
 *     tsx scripts/bench-batch.ts
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { ulid } from "ulid";
import * as schema from "@/lib/db/schema";
import { decisionEventsTable } from "@/lib/db/schema";
import { generateId, generateOrderedIdFactory } from "@/lib/id";
import { withTransaction, lockCollectionCurator } from "@/lib/transactions";
import { PreferenceController } from "@/server/api/preferences";
import type { Database } from "@/lib/db";
import {
  resolveLocalUrl,
  stats,
  loadDemoImages,
  resolveBlobKeys,
  ensureOwner,
  seedCollection,
  type SeededCollection,
} from "./seed-load-core";

// 50 = the batch route's max entries per request AND the flusher's chunk size
// (spec §2.1 / parent §7.3) — the exact amortization the thresholds rest on.
const DECISIONS = 50;

// Deterministic triage spread across all four buckets, like a real first pass.
const TRIAGE_RESULTS = ["top", "high", "medium", "low"] as const;
const triageDecision = (itemId: string, i: number) => ({
  itemId,
  result: TRIAGE_RESULTS[i % TRIAGE_RESULTS.length],
});

function schemaTableNames(): string[] {
  return (Object.values(schema) as unknown[])
    .filter((v): v is PgTable => is(v, PgTable))
    .map((t) => `"${getTableName(t)}"`);
}

/**
 * (a) The single route's unit, DECISIONS times sequentially: each decision is
 * its own transaction — advisory lock, one insert, one full recompute — timed
 * individually (exactly what a round of un-batched taps costs the DB).
 */
async function runSingles(
  db: Database,
  c: SeededCollection,
  curatorId: string,
): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < DECISIONS; i++) {
    const itemId = c.itemIds[i];
    const t0 = performance.now();
    await withTransaction(db, async (tx) => {
      await lockCollectionCurator(tx, c.collectionId, curatorId);
      await tx.insert(decisionEventsTable).values({
        id: generateId("event"),
        sessionId: c.sessionId,
        type: "triage",
        decision: triageDecision(itemId, i),
        clientKey: ulid().toLowerCase(),
        // createdAt OMITTED — defaultNow(), same bowl domain as the routes.
      });
      await PreferenceController.fromDb(tx).recalculatePreferences(c.collectionId, curatorId);
    });
    samples.push(performance.now() - t0);
  }
  return samples;
}

/**
 * (b) The batch route's unit, once: ONE transaction — advisory lock, DECISIONS
 * monotonic-id inserts (same ON CONFLICT defense as the route), ONE recompute.
 */
async function runBatch(
  db: Database,
  c: SeededCollection,
  curatorId: string,
): Promise<number> {
  const nextId = generateOrderedIdFactory();
  const t0 = performance.now();
  await withTransaction(db, async (tx) => {
    await lockCollectionCurator(tx, c.collectionId, curatorId);
    for (let i = 0; i < DECISIONS; i++) {
      await tx
        .insert(decisionEventsTable)
        .values({
          id: nextId(),
          sessionId: c.sessionId,
          type: "triage",
          decision: triageDecision(c.itemIds[i], i),
          clientKey: ulid().toLowerCase(),
        })
        .onConflictDoNothing({
          target: [decisionEventsTable.sessionId, decisionEventsTable.clientKey],
          where: sql`${decisionEventsTable.clientKey} is not null`,
        });
    }
    await PreferenceController.fromDb(tx).recalculatePreferences(c.collectionId, curatorId);
  });
  return performance.now() - t0;
}

async function main(): Promise<void> {
  const url = resolveLocalUrl(process.argv.slice(2)); // aborts if non-local

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema }) as unknown as Database;

  try {
    // Fresh DB so timings aren't polluted by prior rows.
    await db.execute(
      sql.raw(`TRUNCATE TABLE ${schemaTableNames().join(", ")} RESTART IDENTITY CASCADE;`),
    );

    // eslint-disable-next-line no-console
    console.log(`bench-batch: seeding 2×${DECISIONS} items (one collection per scenario)…`);
    const images = loadDemoImages();
    const { keys } = await resolveBlobKeys(images); // placeholder keys fine — timing is unaffected
    const ownerId = await ensureOwner(db, "bench-batch@adored.test");
    // Separate identical collections so scenario (a) can't warm caches for (b).
    const singlesSeed = await seedCollection(db, ownerId, 0, DECISIONS, keys);
    const batchSeed = await seedCollection(db, ownerId, 1, DECISIONS, keys);

    // eslint-disable-next-line no-console
    console.log(`bench-batch: (a) ${DECISIONS} sequential single-decision transactions…`);
    const singles = stats(await runSingles(db, singlesSeed, ownerId));

    // eslint-disable-next-line no-console
    console.log(`bench-batch: (b) one ${DECISIONS}-entry batch transaction…`);
    const batchTotal = await runBatch(db, batchSeed, ownerId);
    const batchPerDecision = batchTotal / DECISIONS;

    // eslint-disable-next-line no-console
    console.log(
      `\nSINGLE ROUTE (${DECISIONS} transactions, each lock+insert+recompute):\n` +
        `  total=${singles.total.toFixed(1)}ms mean=${singles.mean.toFixed(1)}ms ` +
        `p50=${singles.p50.toFixed(1)}ms p95=${singles.p95.toFixed(1)}ms max=${singles.max.toFixed(1)}ms`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `BATCH ROUTE (1 transaction, lock+${DECISIONS} inserts+ONE recompute):\n` +
        `  total=${batchTotal.toFixed(1)}ms → ${batchPerDecision.toFixed(2)}ms/decision amortized`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `\nAMORTIZATION: ${singles.mean.toFixed(1)}ms/decision (singles mean) vs ` +
        `${batchPerDecision.toFixed(2)}ms/decision (batch) — ` +
        `${(singles.mean / batchPerDecision).toFixed(1)}× per decision, ` +
        `${(singles.total / batchTotal).toFixed(1)}× wall-bowl for the round.`,
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("bench-batch: error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
