/**
 * bench-recompute — ADVISORY sort-recompute regression benchmark.
 *
 * Promotes the `seed-load --sort` timing harness into a baseline-comparing
 * benchmark. It seeds a fixed `--items` (default 100) into a fresh LOCAL DB,
 * drives a full triage + binary-insertion compare sort timing every recompute
 * (the same `withTransaction(...) recalculatePreferences(...)` unit the
 * /api/sessions/[id]/decisions route runs), and reports the COMPARE-phase
 * p50/p95/max — the compute-bound hot path where an algorithmic regression
 * (e.g. an O(N²) engine returning) would show up.
 *
 * TWO MODES:
 *   --update-baseline   run the bench and WRITE stats to bench/recompute-baseline.json
 *   (default: check)    run the bench, PRINT current vs baseline, WARN LOUDLY if
 *                       p95 > 2× baseline.p95
 *
 * ============================ ADVISORY, NOT BLOCKING ============================
 * This script ALWAYS EXITS 0 in check mode — it must NEVER fail a PR. The CI job
 * that runs it is non-required (continue-on-error). Local Docker Postgres p95 is
 * NOT Neon prod p95, so an ABSOLUTE latency gate would be pure noise. What this
 * DOES catch is an ALGORITHMIC SHAPE regression: the compare-phase p95 doubling
 * at a fixed item count means the per-recompute cost curve changed (an O(N²) path
 * came back), independent of the absolute machine speed. Re-baseline deliberately
 * (--update-baseline) only when the algorithm legitimately changes.
 * ===============================================================================
 *
 * SAFETY — LOCAL DB ONLY (same guard as seed-load): refuses any non-localhost
 * host. It writes and TRUNCATEs, so it must never touch a remote/prod DB.
 *
 * USAGE:
 *   DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test \
 *     tsx scripts/bench-recompute.ts [--items=100] [--update-baseline]
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import type { Database } from "@/lib/db";
import {
  resolveLocalUrl,
  stats,
  loadDemoImages,
  resolveBlobKeys,
  ensureOwner,
  seedCollection,
  driveSort,
  type Stats,
} from "./seed-load-core";

const BASELINE_PATH = join(__dirname, "..", "bench", "recompute-baseline.json");
// A loose multiplier over the committed baseline. Catches a SHAPE change (p95
// doubling at fixed N), not micro-noise. See the ADVISORY note above.
const P95_REGRESSION_MULTIPLIER = 2;
const DEFAULT_ITEMS = 100;

interface Baseline {
  // Metadata so a stale baseline is self-describing when someone opens the file.
  description: string;
  items: number;
  generatedAt: string;
  // The compare-phase recompute stats (the algorithmic hot path).
  compare: Stats;
  // Triage stats too, for context (not gated on).
  triage: Stats;
}

function parseItems(argv: string[]): number {
  const i = argv.findIndex((a) => a === "--items" || a.startsWith("--items="));
  if (i < 0) return DEFAULT_ITEMS;
  const a = argv[i];
  const raw = a.includes("=") ? a.split(/=(.*)/s)[1] : argv[i + 1];
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error("--items must be a positive integer");
  return n;
}

function schemaTableNames(): string[] {
  return (Object.values(schema) as unknown[])
    .filter((v): v is PgTable => is(v, PgTable))
    .map((t) => `"${getTableName(t)}"`);
}

/** Seed a single collection of `items` and drive a full timed sort. */
async function runBench(db: Database, items: number): Promise<{ triage: Stats; compare: Stats }> {
  // Fresh DB so timings aren't polluted by prior rows (bigger tables → slower
  // reads that have nothing to do with the recompute algorithm).
  await db.execute(sql.raw(`TRUNCATE TABLE ${schemaTableNames().join(", ")} RESTART IDENTITY CASCADE;`));

  const images = loadDemoImages();
  const { keys } = await resolveBlobKeys(images); // placeholder keys fine — timing is unaffected
  const ownerId = await ensureOwner(db, "bench-recompute@adored.test");
  const seeded = await seedCollection(db, ownerId, 0, items, keys);

  const { triage, compare } = await driveSort(db, seeded, ownerId);
  return { triage: stats(triage), compare: stats(compare) };
}

function fmt(s: Stats): string {
  return `n=${s.n} p50=${s.p50.toFixed(1)}ms p95=${s.p95.toFixed(1)}ms max=${s.max.toFixed(1)}ms`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const items = parseItems(argv);
  const updateBaseline = argv.includes("--update-baseline");
  const url = resolveLocalUrl(argv); // aborts if non-local

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema }) as unknown as Database;

  try {
    // eslint-disable-next-line no-console
    console.log(`bench-recompute: seeding ${items} items and timing the recompute…`);
    const { triage, compare } = await runBench(db, items);

    // eslint-disable-next-line no-console
    console.log(`\nCURRENT @ ${items} items:`);
    // eslint-disable-next-line no-console
    console.log(`  triage   ${fmt(triage)}`);
    // eslint-disable-next-line no-console
    console.log(`  compare  ${fmt(compare)}   ← gated phase (algorithmic hot path)`);

    if (updateBaseline) {
      const baseline: Baseline = {
        description:
          "ADVISORY sort-recompute baseline. Local Docker Postgres p95 ≠ Neon prod p95; " +
          "this gate flags an ALGORITHMIC shape regression (compare p95 doubling at fixed " +
          "items), not absolute prod latency. Re-baseline only on a deliberate algorithm change.",
        items,
        generatedAt: new Date().toISOString(),
        compare,
        triage,
      };
      mkdirSync(dirname(BASELINE_PATH), { recursive: true });
      writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
      // eslint-disable-next-line no-console
      console.log(`\nbench-recompute: wrote baseline → ${BASELINE_PATH}`);
      return;
    }

    // ---- check mode (ADVISORY — always exits 0) ----
    if (!existsSync(BASELINE_PATH)) {
      // eslint-disable-next-line no-console
      console.log(
        `\nbench-recompute: no baseline at ${BASELINE_PATH} — run with --update-baseline to create one. ` +
          `(advisory: not failing)`,
      );
      return;
    }
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
    const threshold = baseline.compare.p95 * P95_REGRESSION_MULTIPLIER;
    const ratio = baseline.compare.p95 > 0 ? compare.p95 / baseline.compare.p95 : 0;

    // eslint-disable-next-line no-console
    console.log(
      `\nBASELINE @ ${baseline.items} items (generated ${baseline.generatedAt}):\n` +
        `  compare  p50=${baseline.compare.p50.toFixed(1)}ms ` +
        `p95=${baseline.compare.p95.toFixed(1)}ms max=${baseline.compare.max.toFixed(1)}ms`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `\nCOMPARE p95: current ${compare.p95.toFixed(1)}ms vs baseline ` +
        `${baseline.compare.p95.toFixed(1)}ms (${ratio.toFixed(2)}×; warn threshold ${P95_REGRESSION_MULTIPLIER}×).`,
    );

    if (compare.p95 > threshold) {
      // eslint-disable-next-line no-console
      console.warn(
        `\n############################################################\n` +
          `## ⚠️  ADVISORY: compare-phase p95 REGRESSED ${ratio.toFixed(2)}× over baseline.\n` +
          `##     current p95 ${compare.p95.toFixed(1)}ms > ${threshold.toFixed(1)}ms (${P95_REGRESSION_MULTIPLIER}× baseline).\n` +
          `##     This is a SHAPE signal (possible algorithmic regression, e.g. an\n` +
          `##     O(N²) path). Local Docker p95 ≠ Neon prod p95, so investigate the\n` +
          `##     ALGORITHM, not the absolute number. NOT failing the build (advisory).\n` +
          `############################################################`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`\nbench-recompute: compare p95 within ${P95_REGRESSION_MULTIPLIER}× of baseline — OK (advisory).`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

// ADVISORY: even an unexpected error must not fail the (non-required) CI job.
// Print it and exit 0 — a broken bench harness is not a merge blocker.
main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("bench-recompute: error (advisory, not failing):", err instanceof Error ? err.message : err);
  })
  .finally(() => process.exit(0));
