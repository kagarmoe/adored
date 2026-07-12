/**
 * bench-recompute — sort-recompute regression GATE.
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
 *   (default: check)    run the bench, PRINT current vs baseline, WARN at 2×,
 *                       FAIL (exit 1) at 4× baseline compare p95
 *
 * ============================== BLOCKING, AT 4× ================================
 * The gate is deliberately GENEROUS. The committed baseline is dev-Mac hardware;
 * a GitHub runner already measures ~1.5× that p95 from hardware alone, and a
 * noisy neighbour can add more. A 2× gate would be a flake generator (and a flaky
 * gate gets disabled, which is worse than no gate). 4× keeps ~2.6× of headroom
 * over the observed CI ratio while still catching the thing this bench exists for:
 * an O(N²) path coming back is a multiple-x blowup at N=100, not a 3× one.
 * The 2× line stays as a printed warning. A bench that cannot RUN also fails —
 * a broken gate is not a pass.
 * ===============================================================================
 *
 * SAFETY — LOCAL DB ONLY (same guard as seed-load): refuses any non-localhost
 * host. It writes and TRUNCATEs, so it must never touch a remote/prod DB.
 *
 * USAGE:
 *   bash e2e/fixtures/test-db.sh up
 *   tsx scripts/bench-recompute.ts [--items=100] [--update-baseline]
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
// Printed-only: a 2× compare p95 is worth a human look, but CI hardware alone
// already lands ~1.5× over the dev-Mac baseline, so it cannot be the gate.
const P95_WARN_MULTIPLIER = 2;
// The gate. See the BLOCKING note above for why it is this loose.
const P95_FAIL_MULTIPLIER = 4;
const DEFAULT_ITEMS = 100;

/** Pure gate decision: is the compare-phase p95 a multiple-x regression? */
export function benchVerdict(
  current: Stats,
  baseline: Stats,
): { ratio: number; failed: boolean } {
  const ratio = baseline.p95 > 0 ? current.p95 / baseline.p95 : 0;
  return { ratio, failed: current.p95 > baseline.p95 * P95_FAIL_MULTIPLIER };
}

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
          "Sort-recompute baseline. Local Docker Postgres p95 ≠ Neon prod p95; the CI gate " +
          "flags an ALGORITHMIC shape regression (compare p95 > 4× this baseline at fixed " +
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

    // ---- check mode (GATE) ----
    if (!existsSync(BASELINE_PATH)) {
      // A gate with no baseline is not a gate — fail rather than pretend.
      throw new Error(
        `no baseline at ${BASELINE_PATH} — run with --update-baseline to create one`,
      );
    }
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
    const { ratio, failed } = benchVerdict(compare, baseline.compare);
    const failThreshold = baseline.compare.p95 * P95_FAIL_MULTIPLIER;

    // eslint-disable-next-line no-console
    console.log(
      `\nBASELINE @ ${baseline.items} items (generated ${baseline.generatedAt}):\n` +
        `  compare  p50=${baseline.compare.p50.toFixed(1)}ms ` +
        `p95=${baseline.compare.p95.toFixed(1)}ms max=${baseline.compare.max.toFixed(1)}ms`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `\nCOMPARE p95: current ${compare.p95.toFixed(1)}ms vs baseline ` +
        `${baseline.compare.p95.toFixed(1)}ms (${ratio.toFixed(2)}×; warn ${P95_WARN_MULTIPLIER}×, FAIL ${P95_FAIL_MULTIPLIER}×).`,
    );

    if (failed) {
      throw new Error(
        `compare-phase p95 REGRESSED ${ratio.toFixed(2)}× over baseline ` +
          `(${compare.p95.toFixed(1)}ms > ${failThreshold.toFixed(1)}ms = ${P95_FAIL_MULTIPLIER}× baseline). ` +
          `A multiple-x blowup at a fixed item count is an ALGORITHMIC shape regression ` +
          `(e.g. an O(N²) path returning) — investigate the algorithm, not the absolute ms. ` +
          `Re-baseline (--update-baseline) only if the algorithm changed deliberately.`,
      );
    }
    if (ratio > P95_WARN_MULTIPLIER) {
      // eslint-disable-next-line no-console
      console.warn(
        `\n⚠️  compare p95 is ${ratio.toFixed(2)}× baseline (over the ${P95_WARN_MULTIPLIER}× warn line, ` +
          `under the ${P95_FAIL_MULTIPLIER}× gate). Worth a look; runner noise can explain some of it.`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`\nbench-recompute: compare p95 within ${P95_WARN_MULTIPLIER}× of baseline — OK.`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

// Entrypoint only when executed (not when a test imports benchVerdict).
// A bench that cannot run is a broken gate, not a pass: any error exits 1.
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("bench-recompute: FAILED —", err);
    process.exit(1);
  });
}
