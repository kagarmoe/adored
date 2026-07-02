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
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { user, collectionsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { PreferenceController } from "@/server/api/preferences";
import { withTransaction } from "@/lib/transactions";
import {
  deriveOrder,
  RANKABLE_BUCKETS,
  toComparisonEvents,
  type RankItem,
} from "@/lib/insertion-ranking";
import type { Database } from "@/lib/db";

const DEMO_DIR = join(__dirname, "..", "e2e", "fixtures", "demo-images");
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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

// ---- LOCAL-DB safety guard -------------------------------------------------

function resolveLocalUrl(argv: string[]): string {
  const cliUrl = (() => {
    const i = argv.findIndex((a) => a === "--database-url" || a.startsWith("--database-url="));
    if (i < 0) return undefined;
    const a = argv[i];
    return a.includes("=") ? a.split(/=(.*)/s)[1] : argv[i + 1];
  })();
  const url =
    process.env.DATABASE_URL_TEST ??
    cliUrl ??
    process.env.DATABASE_URL ??
    "postgresql://postgres:test@localhost:5433/app_test";

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("seed-load guard: target DB URL is not a valid URL. Refusing to run.");
  }
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(
      `seed-load guard: refusing to seed — host "${host}" is not local.\n` +
        `This tool writes/TRUNCATEs data and must target the LOCAL dev/test DB\n` +
        `(localhost/127.0.0.1) only, NEVER a remote/prod (e.g. Neon) database.\n` +
        `Set DATABASE_URL_TEST to the local container, e.g.\n` +
        `  DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test`,
    );
  }
  return url;
}

// ---- image → blobKey resolution --------------------------------------------

interface DemoImage {
  filename: string;
  buffer: Buffer;
  contentType: string;
}

/** Load the committed demo images (both sets), sorted for determinism. */
function loadDemoImages(): DemoImage[] {
  if (!existsSync(DEMO_DIR)) {
    throw new Error(`seed-load: demo image dir missing (${DEMO_DIR}). Run: node scripts/fetch-demo-images.mjs`);
  }
  const files = readdirSync(DEMO_DIR)
    .filter((f) => f.endsWith(".webp"))
    .sort();
  if (files.length === 0) {
    throw new Error(`seed-load: no .webp demo images in ${DEMO_DIR}. Run: node scripts/fetch-demo-images.mjs`);
  }
  return files.map((filename) => ({
    filename,
    buffer: readFileSync(join(DEMO_DIR, filename)),
    contentType: "image/webp",
  }));
}

/**
 * Resolve each demo image to a blobKey that /file can actually serve. Photos are
 * ALWAYS served through @vercel/blob's get() — there is no public/ or local-fs
 * fallback in servePhotoFile — so to RENDER in local dev the bytes must live in a
 * real Vercel Blob store. When BLOB_READ_WRITE_TOKEN is set we upload each image
 * once (public access → blob.url is the blobKey, exactly like the real upload
 * route). Without a token we fall back to a stable placeholder key: rows still
 * seed and the DB perf timing is unaffected, but images won't render (the /file
 * get() 404s) — the script warns about this.
 */
async function resolveBlobKeys(images: DemoImage[]): Promise<{ keys: string[]; rendered: boolean }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    // eslint-disable-next-line no-console
    console.warn(
      "seed-load: BLOB_READ_WRITE_TOKEN not set — photos will NOT render in local dev\n" +
        "  (rows still seed; set the token to upload demo images to Vercel Blob so /file serves them).",
    );
    return { keys: images.map((img) => `demo-seed-placeholder/${img.filename}`), rendered: false };
  }
  const { put } = await import("@vercel/blob");
  const keys: string[] = [];
  for (const img of images) {
    // Deterministic pathname (no random suffix) so re-seeding overwrites rather
    // than orphaning; public access so getBlobAccess()==="public" and get() serves it.
    const res = await put(`demo-seed/${img.filename}`, img.buffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: img.contentType,
      token,
    });
    keys.push(res.url);
  }
  // eslint-disable-next-line no-console
  console.log(`seed-load: uploaded ${keys.length} demo images to Vercel Blob (photos will render).`);
  return { keys, rendered: true };
}

// ---- seed core -------------------------------------------------------------

async function ensureOwner(db: Database, email: string): Promise<string> {
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing.length) return existing[0].id;
  const id = generateId("user");
  const hashed = await bcrypt.hash("demo-seed-password-123", 12);
  await db.insert(user).values({ id, email, name: "Demo Seed Owner", password: hashed, emailVerified: new Date() });
  return id;
}

interface SeededCollection {
  collectionId: string;
  sessionId: string;
  itemIds: string[];
}

async function seedCollection(
  db: Database,
  ownerId: string,
  index: number,
  itemCount: number,
  blobKeys: string[],
): Promise<SeededCollection> {
  const collectionId = generateId("col");
  await db.insert(collectionsTable).values({
    id: collectionId,
    ownerId,
    name: `Demo Load Collection ${index + 1}`,
    slug: `demo-load-${index + 1}-${collectionId}`,
  });

  const itemRepo = new ItemRepository(db);
  const photoRepo = new PhotoRepository(db);
  const itemIds: string[] = [];
  for (let i = 0; i < itemCount; i++) {
    const item = await itemRepo.create({ collectionId, name: `Demo Item ${i + 1}` });
    const blobKey = blobKeys[(index * itemCount + i) % blobKeys.length];
    await photoRepo.create({
      itemId: item.id,
      collectionId,
      blobKey,
      filename: blobKey.split("/").pop() ?? "demo.webp",
      mimeType: "image/webp",
      fileSize: 1,
      uploadedBy: ownerId,
      isHero: true,
    });
    itemIds.push(item.id);
  }

  const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
  return { collectionId, sessionId: session.id, itemIds };
}

// ---- sort driver + recompute timing ----------------------------------------

interface TimingRow {
  label: string;
  ms: number;
}

function stats(samples: number[]): { total: number; mean: number; p50: number; p95: number; max: number } {
  if (samples.length === 0) return { total: 0, mean: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((s, x) => s + x, 0);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { total, mean: total / samples.length, p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] };
}

/** Run the FULL recompute inside a transaction (as the route does) and time it. */
async function timedRecompute(db: Database, collectionId: string, curatorId: string): Promise<number> {
  const t0 = performance.now();
  await withTransaction(db, async (tx) => {
    await PreferenceController.fromDb(tx).recalculatePreferences(collectionId, curatorId);
  });
  return performance.now() - t0;
}

/**
 * Drive a full sort for one collection and time every recompute:
 *   1. triage each item (record decision + recompute) → all into rankable buckets,
 *   2. binary-insertion compare loop: read state, ask deriveOrder for nextPair,
 *      record a decisive pairwise answer, recompute — until fully ordered.
 * Returns the per-phase recompute timings.
 */
async function driveSort(
  db: Database,
  c: SeededCollection,
  curatorId: string,
): Promise<{ triage: number[]; compare: number[] }> {
  const decisionRepo = new DecisionEventRepository(db);
  const prefRepo = new CollectionPreferenceItemRepository(db);
  const itemRepo = new ItemRepository(db);

  const triage: number[] = [];
  const compare: number[] = [];

  // Triage: alternate top/high so every item is rankable (RANKABLE_BUCKETS).
  for (let i = 0; i < c.itemIds.length; i++) {
    const itemId = c.itemIds[i];
    await withTransaction(db, async (tx) => {
      await new DecisionEventRepository(tx).create({
        sessionId: c.sessionId,
        type: "triage",
        decision: { itemId, result: i % 2 === 0 ? "top" : "high" },
      });
    });
    triage.push(await timedRecompute(db, c.collectionId, curatorId));
  }

  // Compare loop — deterministic answers via a stable id order (a<b ⇒ item_a
  // "more loved"), so the binary insertion always terminates. Each answer is
  // followed by the same recompute the route runs, timed.
  const preferMoreLoved = (aId: string, bId: string): "item_a" | "item_b" =>
    aId < bId ? "item_a" : "item_b";

  // Guard against an unexpected non-terminating loop; O(N log N) answers expected.
  const maxSteps = c.itemIds.length * 32 + 16;
  for (let step = 0; step < maxSteps; step++) {
    const [prefs, items, decisions] = await Promise.all([
      prefRepo.findByCollection(c.collectionId, curatorId),
      itemRepo.findByCollection(c.collectionId),
      decisionRepo.findBySession(c.sessionId),
    ]);
    const rankableIds = new Set(
      prefs.filter((p) => RANKABLE_BUCKETS.has(p.rankBucket)).map((p) => p.itemId),
    );
    const rankItems: RankItem[] = items
      .filter((i) => rankableIds.has(i.id))
      .map((i) => ({ id: i.id, createdAt: i.createdAt }));
    const { nextPair } = deriveOrder(rankItems, toComparisonEvents(decisions));
    if (!nextPair) break;

    const [aId, bId] = nextPair;
    await withTransaction(db, async (tx) => {
      await new DecisionEventRepository(tx).create({
        sessionId: c.sessionId,
        type: "pairwise_compare",
        decision: { itemAId: aId, itemBId: bId, result: preferMoreLoved(aId, bId) },
      });
    });
    compare.push(await timedRecompute(db, c.collectionId, curatorId));
  }

  return { triage, compare };
}

function reportTimings(label: string, itemCount: number, samples: number[]): TimingRow[] {
  const s = stats(samples);
  // eslint-disable-next-line no-console
  console.log(
    `  ${label.padEnd(8)} n=${String(samples.length).padStart(4)}  ` +
      `total=${s.total.toFixed(0).padStart(7)}ms  mean=${s.mean.toFixed(1).padStart(6)}ms  ` +
      `p50=${s.p50.toFixed(1).padStart(6)}ms  p95=${s.p95.toFixed(1).padStart(6)}ms  ` +
      `max=${s.max.toFixed(1).padStart(6)}ms`,
  );
  return [{ label: `${label}@${itemCount}`, ms: s.total }];
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
      reportTimings("triage", opts.items, allTriage);
      reportTimings("compare", opts.items, allCompare);
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
