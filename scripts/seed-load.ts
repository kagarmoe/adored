/**
 * seed-load — parametrized demo-data seeder + sort-recompute timing harness.
 *
 * Purpose: realistically load-test the LOCAL dev/test DB — especially the
 * sort/compare recompute path (`PreferenceStateService.recalculatePreferences`,
 * the same code the /api/sessions/[id]/decisions route runs under a row lock).
 * It also seeds real collection + item + photo rows referencing the committed
 * demo images (e2e/fixtures/demo-images) so a seeded collection RENDERS in local
 * dev and doubles as fixture data for the future onboarding walkthrough.
 *
 * The seed + timing ENGINE lives in `seed-load-core.ts`, shared verbatim with
 * the CI regression benchmark (`bench-recompute.ts`) so both measure the exact
 * same `withTransaction(...) recalculatePreferences(...)` unit the route runs.
 *
 * USAGE (run against the LOCAL test DB — see the guard below):
 *
 *   DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test \
 *     node -r esbuild-register scripts/seed-load.ts [flags]
 *
 *   npm run seed:load -- [flags]              # wires the same, default local URL
 *
 * FLAGS (CLI `--k=v` or `--k v`; env fallback in parens):
 *   --collections=N     number of collections to create        (default 2)
 *   --items=N           items per collection                   (default 15; knob to 50/100/200)
 *   --owner-email=E     demo owner user email    (SEED_OWNER_EMAIL, default demo-seed@adored.test)
 *   --sort              drive a full triage+compare sort and TIME the recompute path
 *   --reset             TRUNCATE all tables first (local only)
 *   --help
 *
 * SAFETY — LOCAL DB ONLY. The script resolves its target from DATABASE_URL_TEST,
 * else --database-url, else DATABASE_URL, and REFUSES to run unless the host is
 * localhost/127.0.0.1/::1. It never seeds a remote/prod (e.g. Neon) database —
 * it aborts with a clear message. Fail-closed: an unparseable URL also aborts.
 *
 * --sort timing: for each collection it triages every item into a rankable
 * bucket, then runs the binary-insertion compare loop — recording a
 * pairwise_compare decision and re-running the FULL recompute under a
 * transaction per answer, exactly as the route does — and prints per-decision
 * and total recompute wall-time plus row counts, so compare perf is visible as
 * items scale.
 */
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
  type SeededCollection,
} from "./seed-load-core";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";

// ---- CLI / env parsing -----------------------------------------------------

interface Options {
  collections: number;
  items: number;
  ownerEmail: string;
  sort: boolean;
  reset: boolean;
}

function parseArgs(argv: string[]): Options {
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const body = a.slice(2);
    if (body.includes("=")) {
      const [k, v] = body.split(/=(.*)/s);
      flags.set(k, v);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      flags.set(body, argv[++i]);
    } else {
      flags.set(body, true);
    }
  }
  if (flags.has("help")) {
    printHelpAndExit();
  }
  const num = (k: string, d: number): number => {
    const v = flags.get(k);
    if (v === undefined || v === true) return d;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`--${k} must be a non-negative integer`);
    return n;
  };
  return {
    collections: num("collections", 2),
    items: num("items", 15),
    ownerEmail:
      (flags.get("owner-email") as string) ??
      process.env.SEED_OWNER_EMAIL ??
      "demo-seed@adored.test",
    sort: flags.get("sort") === true || flags.get("sort") === "true",
    reset: flags.get("reset") === true || flags.get("reset") === "true",
  };
}

function printHelpAndExit(): never {
  // eslint-disable-next-line no-console
  console.log(
    `seed-load — demo data + sort-recompute timing (LOCAL DB ONLY)\n\n` +
      `  node -r esbuild-register scripts/seed-load.ts [--collections=2] [--items=15]\n` +
      `    [--owner-email=demo-seed@adored.test] [--sort] [--reset]\n\n` +
      `  npm run seed:load -- --items=100 --sort\n`,
  );
  process.exit(0);
}

// ---- reporting -------------------------------------------------------------

function reportTimings(label: string, samples: number[]): void {
  const s = stats(samples);
  // eslint-disable-next-line no-console
  console.log(
    `  ${label.padEnd(8)} n=${String(s.n).padStart(4)}  ` +
      `total=${s.total.toFixed(0).padStart(7)}ms  mean=${s.mean.toFixed(1).padStart(6)}ms  ` +
      `p50=${s.p50.toFixed(1).padStart(6)}ms  p95=${s.p95.toFixed(1).padStart(6)}ms  ` +
      `max=${s.max.toFixed(1).padStart(6)}ms`,
  );
}

// ---- main ------------------------------------------------------------------

function schemaTableNames(): string[] {
  return (Object.values(schema) as unknown[])
    .filter((v): v is PgTable => is(v, PgTable))
    .map((t) => `"${getTableName(t)}"`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  const url = resolveLocalUrl(argv); // aborts if non-local

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema }) as unknown as Database;

  try {
    if (opts.reset) {
      await db.execute(sql.raw(`TRUNCATE TABLE ${schemaTableNames().join(", ")} RESTART IDENTITY CASCADE;`));
      // eslint-disable-next-line no-console
      console.log("seed-load: reset — all tables truncated.");
    }

    const images = loadDemoImages();
    const { keys, rendered } = await resolveBlobKeys(images);
    if (!rendered) {
      // eslint-disable-next-line no-console
      console.warn(
        "seed-load: BLOB_READ_WRITE_TOKEN not set — photos will NOT render in local dev\n" +
          "  (rows still seed; set the token to upload demo images to Vercel Blob so /file serves them).",
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`seed-load: uploaded ${keys.length} demo images to Vercel Blob (photos will render).`);
    }

    const ownerId = await ensureOwner(db, opts.ownerEmail);
    // eslint-disable-next-line no-console
    console.log(
      `seed-load: owner ${opts.ownerEmail}; ${opts.collections} collections × ${opts.items} items ` +
        `(${images.length} demo images, render=${rendered}).`,
    );

    const seeded: SeededCollection[] = [];
    for (let c = 0; c < opts.collections; c++) {
      const sc = await seedCollection(db, ownerId, c, opts.items, keys);
      seeded.push(sc);
      // eslint-disable-next-line no-console
      console.log(`  collection ${c + 1}: ${sc.collectionId} (${sc.itemIds.length} items)`);
    }

    if (opts.sort) {
      // eslint-disable-next-line no-console
      console.log(`\nseed-load: driving sort + timing recompute (${opts.items} rankable items/collection)…`);
      const allTriage: number[] = [];
      const allCompare: number[] = [];
      for (const sc of seeded) {
        const { triage, compare } = await driveSort(db, sc, ownerId);
        allTriage.push(...triage);
        allCompare.push(...compare);
      }
      // eslint-disable-next-line no-console
      console.log(`\nRECOMPUTE TIMINGS @ ${opts.items} items/collection (${opts.collections} collections):`);
      reportTimings("triage", allTriage);
      reportTimings("compare", allCompare);
      const finalPref = await new CollectionPreferenceItemRepository(db).findByCollection(
        seeded[0].collectionId,
        ownerId,
      );
      // eslint-disable-next-line no-console
      console.log(
        `  rows: ${finalPref.length} preference rows in collection 1; ` +
          `${allCompare.length} compare decisions recorded across ${opts.collections} collections.`,
      );
    }

    // eslint-disable-next-line no-console
    console.log("\nseed-load: done.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
