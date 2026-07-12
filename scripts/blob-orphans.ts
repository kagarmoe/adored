// Reconciliation sweep for blob orphans (purses-6eb).
//
// Purges delete DB rows in a transaction, then delete the backing blobs
// best-effort AFTER commit. When that post-commit del fails (or the process
// dies between the two), the row is gone and the blob is stranded — costing
// money forever with nothing left to retry from. This script finds those.
//
// REPORT-ONLY by default. `--delete` is opt-in, because a wrong "referenced"
// answer here deletes a live user's photos. Run the report, read it, then decide.
//
// `--delete` also refuses to run when the result looks like the DB and the blob
// token are from different environments (see deleteRefusal); `--force` overrides.
//
//   npm run blob:orphans            # report
//   npm run blob:orphans -- --delete
import { list, del } from "@vercel/blob";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";
import { photosTable } from "@/lib/db/schema";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env.development.local" });

export type BlobEntry = { pathname: string; url: string; size: number; uploadedAt: Date };
export type PhotoRow = { id: string; collectionId: string; blobKey: string };

// An upload that hasn't committed its row yet must never look like an orphan.
const GRACE_MS = 24 * 60 * 60 * 1000;

/** The blob's pathname as `list()` reports it (no leading slash). Legacy
 *  non-http blob_keys are already stored in pathname form. */
function keyToPathname(blobKey: string): string {
  if (!blobKey.startsWith("http")) return blobKey.replace(/^\//, "");
  try {
    return decodeURIComponent(new URL(blobKey).pathname).replace(/^\//, "");
  } catch {
    return blobKey;
  }
}

/**
 * A blob is an orphan iff nothing in `photos` references it:
 *  - an ORIGINAL is referenced by a row whose blob_key resolves to its pathname;
 *  - a VARIANT (`variants/{collectionId}/{photoId}/…`) is referenced by a row
 *    with BOTH that id and that collection — id alone is not enough, or a variant
 *    filed under the wrong collection would be treated as live forever.
 * Anything uploaded inside the grace window is never an orphan (upload race).
 */
export function findOrphans(blobs: BlobEntry[], photos: PhotoRow[], now: Date): BlobEntry[] {
  const originals = new Set(photos.map((p) => keyToPathname(p.blobKey)));
  const livePhotos = new Set(photos.map((p) => `${p.collectionId}/${p.id}`));
  const cutoff = now.getTime() - GRACE_MS;

  return blobs.filter((b) => {
    if (b.uploadedAt.getTime() > cutoff) return false;

    const variant = b.pathname.match(/^variants\/([^/]+)\/([^/]+)\//);
    if (variant) return !livePhotos.has(`${variant[1]}/${variant[2]}`);

    return !originals.has(b.pathname);
  });
}

// Blast-radius guard. The Blob store is project-wide (one token shared by dev,
// preview and prod) while DATABASE_URL is per-environment, so `--delete` run
// against a local/empty DB would see every production photo as an orphan.
// A sweep should find residue, not the whole store.
const MAX_ORPHAN_SHARE = 0.5;

export function deleteRefusal(
  counts: { blobs: number; photos: number; orphans: number },
  force: boolean,
): string | null {
  if (force) return null;
  if (counts.photos === 0) {
    return "Refusing to delete: the DB returned no photo rows. Check DATABASE_URL points at the same environment as BLOB_READ_WRITE_TOKEN.";
  }
  if (counts.orphans > counts.blobs * MAX_ORPHAN_SHARE) {
    return `Refusing to delete: ${counts.orphans} of ${counts.blobs} blobs look orphaned — that is too much of the store to be residue. Check DATABASE_URL points at the same environment as BLOB_READ_WRITE_TOKEN.`;
  }
  return null;
}

async function main() {
  const doDelete = process.argv.includes("--delete");
  const force = process.argv.includes("--force");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // Order is load-bearing: LIST BLOBS FIRST, then read the DB. A blob whose row
  // is inserted between the two reads is then seen as referenced. The reverse
  // order would classify it as an orphan and delete a live photo.
  const blobs: BlobEntry[] = [];
  let cursor: string | undefined;
  do {
    const res = await list({ cursor });
    blobs.push(...res.blobs.map((b) => ({
      pathname: b.pathname,
      url: b.url,
      size: b.size,
      uploadedAt: b.uploadedAt,
    })));
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  const photos = await db
    .select({
      id: photosTable.id,
      collectionId: photosTable.collectionId,
      blobKey: photosTable.blobKey,
    })
    .from(photosTable);
  await client.end({ timeout: 5 });

  const orphans = findOrphans(blobs, photos, new Date());
  const bytes = orphans.reduce((sum, b) => sum + b.size, 0);

  console.log(`Blobs: ${blobs.length}   Photo rows: ${photos.length}`);
  console.log(`Orphans: ${orphans.length}   (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
  for (const b of orphans) console.log(`  ${b.pathname}`);

  if (!doDelete) {
    if (orphans.length > 0) console.log("\nReport only. Re-run with --delete to remove these.");
    return;
  }
  if (orphans.length === 0) return;

  const refusal = deleteRefusal(
    { blobs: blobs.length, photos: photos.length, orphans: orphans.length },
    force,
  );
  if (refusal) {
    console.error(`\n${refusal}\nRe-run with --force only if you are certain.`);
    process.exit(1);
  }

  await del(orphans.map((b) => b.url));
  console.log(`\nDeleted ${orphans.length} orphaned blobs.`);
}

// Only run when invoked as a script — importing this module (tests) must not
// touch Blob or Postgres.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("blob-orphans failed:", e);
    process.exit(1);
  });
}
