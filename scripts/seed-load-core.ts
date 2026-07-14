/**
 * seed-load-core — the shared seed + sort-timing engine.
 *
 * Extracted from seed-load.ts so BOTH the interactive seeder (`seed-load.ts`)
 * and the CI regression benchmark (`bench-recompute.ts`) run the EXACT same
 * timing unit: the full `withTransaction(...) recalculatePreferences(...)` block
 * the /api/sessions/[id]/decisions route runs under a row lock. Keeping this in
 * one place means the bench can never drift from what the seeder measures.
 *
 * LOCAL DB ONLY. `resolveLocalUrl` refuses any non-localhost host — this engine
 * writes/TRUNCATEs and must never point at a remote/prod (e.g. Neon) database.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { user, collectionsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { PreferenceController } from "@/server/api/preferences";
import { withTransaction } from "@/lib/transactions";
import {
  deriveOrder,
  toComparisonEvents,
  type RankItem,
} from "@/lib/insertion-ranking";
import { selectComparableItems } from "@/lib/compare-selection";
import type { Database } from "@/lib/db";

const DEMO_DIR = join(__dirname, "..", "e2e", "fixtures", "demo-images");
export const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// ---- LOCAL-DB safety guard -------------------------------------------------

/**
 * Resolve the target DB URL and REFUSE any non-local host. Fail-closed: an
 * unparseable URL also aborts. Precedence: DATABASE_URL_TEST, --database-url,
 * DATABASE_URL, then the local container default.
 */
export function resolveLocalUrl(argv: string[]): string {
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

// ---- stats -----------------------------------------------------------------

export interface Stats {
  n: number;
  total: number;
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

export function stats(samples: number[]): Stats {
  if (samples.length === 0) return { n: 0, total: 0, mean: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.reduce((s, x) => s + x, 0);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    n: samples.length,
    total,
    mean: total / samples.length,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
  };
}

// ---- image → blobKey resolution --------------------------------------------

export interface DemoImage {
  filename: string;
  buffer: Buffer;
  contentType: string;
}

/** Load the committed demo images (both sets), sorted for determinism. */
export function loadDemoImages(): DemoImage[] {
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
 * get() 404s) — the caller may warn about this.
 */
export async function resolveBlobKeys(
  images: DemoImage[],
): Promise<{ keys: string[]; rendered: boolean }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
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
  return { keys, rendered: true };
}

// ---- seed core -------------------------------------------------------------

export async function ensureOwner(db: Database, email: string): Promise<string> {
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existing.length) return existing[0].id;
  const id = generateId("user");
  // Load/bench seeders own data by id but never authenticate as this owner over
  // HTTP, so no credential row is needed — better-auth owns the password (in the
  // `account` table) for real sign-ins.
  await db.insert(user).values({ id, email, name: "Demo Seed Owner" });
  return id;
}

export interface SeededCollection {
  collectionId: string;
  sessionId: string;
  itemIds: string[];
}

export async function seedCollection(
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

/** Run the FULL recompute inside a transaction (as the route does) and time it. */
export async function timedRecompute(
  db: Database,
  collectionId: string,
  curatorId: string,
): Promise<number> {
  const t0 = performance.now();
  await withTransaction(db, async (tx) => {
    await PreferenceController.fromDb(tx).recalculatePreferences(collectionId, curatorId);
  });
  return performance.now() - t0;
}

/**
 * Drive a full sort for one collection and time every recompute:
 *   1. triage each item (record decision + recompute),
 *   2. binary-insertion compare loop: read state, ask deriveOrder for nextPair,
 *      record a decisive pairwise answer, recompute — until fully ordered.
 * Returns the per-phase recompute timings.
 */
export async function driveSort(
  db: Database,
  c: SeededCollection,
  curatorId: string,
): Promise<{ triage: number[]; compare: number[] }> {
  const decisionRepo = new DecisionEventRepository(db);
  const itemRepo = new ItemRepository(db);

  const triage: number[] = [];
  const compare: number[] = [];

  // Triage: alternate top/high to keep the seed close to a typical user flow.
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
    const [items, decisions] = await Promise.all([
      itemRepo.findByCollection(c.collectionId),
      decisionRepo.findBySession(c.sessionId),
    ]);
    const comparableItems = selectComparableItems(items, new Map());
    const rankItems: RankItem[] = comparableItems
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
