// @ts-check
/**
 * Fetch two reproducible demo-image sets of COMMON OBJECTS (no people / animals /
 * landscapes) from the Openverse API (Creative Commons; free, JSON, permissive
 * licenses CC0 / CC-BY). Downloads each source, compresses to a modest webp
 * (~800px, target <150KB) with sharp, and writes them plus a provenance manifest
 * to e2e/fixtures/demo-images/.
 *
 *   node scripts/fetch-demo-images.mjs
 *
 * REPRODUCIBLE: fixed object queries + fixed license filter + deterministic
 * per-query take order. Re-running overwrites the set from the same source rows.
 *
 * The manifest (manifest.json) records, per image: source (Openverse), the
 * Openverse detail URL, the original source URL, the license + version, and the
 * creator/attribution — so provenance is clear (CC-BY requires attribution) and
 * the set is regenerable + safe to surface in the future onboarding walkthrough.
 *
 * This is a DEV asset generator, run rarely by hand; the committed images are the
 * artifact the seed script consumes. Not part of any gate.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "e2e", "fixtures", "demo-images");

// Permissive CC licenses only (attribution-friendly for onboarding use).
const LICENSES = "cc0,by,by-sa";
const OPENVERSE = "https://api.openverse.org/v1/images/";

// Two curated OBJECT sets. Fixed queries → reproducible. `count` per set ~15–20.
// Set A: clothing / accessories. Set B: furniture / homeware. All queries are
// common inanimate objects — deliberately NO people / animals / landscapes.
const SETS = [
  {
    id: "accessories",
    label: "Clothing & Accessories",
    queries: ["handbag", "backpack", "wristwatch", "sunglasses", "sneaker",
              "scarf", "leather wallet", "fedora hat", "necklace", "silk tie"],
  },
  {
    id: "homeware",
    label: "Furniture & Homeware",
    queries: ["ceramic mug", "flower vase", "armchair", "table lamp", "teapot",
              "wooden chair", "throw pillow", "wall clock", "picture frame", "bookshelf"],
  },
];

const PER_QUERY = 2; // 10 queries * 2 = 20 images per set
const TARGET_WIDTH = 800;
const MAX_BYTES = 150_000;

/** Fetch top Openverse rows for an object query (deterministic order). */
async function search(query) {
  const url = `${OPENVERSE}?q=${encodeURIComponent(query)}&license=${LICENSES}` +
    `&page_size=8&mature=false`;
  const res = await fetch(url, { headers: { "User-Agent": "adored-demo-seed/1.0" } });
  if (!res.ok) throw new Error(`Openverse ${res.status} for "${query}"`);
  const body = await res.json();
  return body.results ?? [];
}

/** Download + compress to webp under MAX_BYTES; returns the buffer, or null. */
async function fetchImage(sourceUrl) {
  const res = await fetch(sourceUrl, { headers: { "User-Agent": "adored-demo-seed/1.0" } });
  if (!res.ok) return null;
  const input = Buffer.from(await res.arrayBuffer());
  for (const quality of [80, 65, 50, 38]) {
    const out = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    if (out.byteLength <= MAX_BYTES) return out;
  }
  // Last resort: smaller dimension.
  return sharp(input, { failOn: "none" })
    .rotate().resize({ width: 560, withoutEnlargement: true })
    .webp({ quality: 45 }).toBuffer();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  /** @type {any[]} */
  const manifest = [];
  const seen = new Set();

  for (const set of SETS) {
    let n = 0;
    for (const query of set.queries) {
      const rows = await search(query);
      let taken = 0;
      for (const row of rows) {
        if (taken >= PER_QUERY) break;
        const src = row.url;
        if (!src || seen.has(row.id)) continue;
        let buf;
        try {
          buf = await fetchImage(src);
        } catch {
          buf = null;
        }
        if (!buf) continue;
        seen.add(row.id);
        n += 1;
        taken += 1;
        const filename = `${set.id}-${String(n).padStart(2, "0")}.webp`;
        await writeFile(join(OUT_DIR, filename), buf);
        manifest.push({
          set: set.id,
          setLabel: set.label,
          filename,
          query,
          bytes: buf.byteLength,
          source: "Openverse",
          openverseId: row.id,
          openverseDetail: row.foreign_landing_url ?? row.detail_url ?? null,
          sourceUrl: src,
          license: (row.license ?? "").toUpperCase(),
          licenseVersion: row.license_version ?? null,
          licenseUrl: row.license_url ?? null,
          title: row.title ?? null,
          creator: row.creator ?? null,
          attribution: row.attribution ?? null,
        });
        // eslint-disable-next-line no-console
        console.log(`  ${filename}  ${(buf.byteLength / 1024).toFixed(0)}KB  ${row.license}  "${query}"`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`set ${set.id}: ${n} images`);
  }

  await writeFile(
    join(OUT_DIR, "manifest.json"),
    JSON.stringify(
      {
        note: "Demo image sets for local DB load-testing and future onboarding. " +
          "Objects only (no people/animals/landscapes). Source: Openverse " +
          "(https://openverse.org) Creative Commons search. Licenses: CC0 / CC-BY / " +
          "CC-BY-SA — attribution recorded per image (required for BY/BY-SA). " +
          "Regenerate with: node scripts/fetch-demo-images.mjs",
        generatedAt: new Date().toISOString().slice(0, 10),
        licenseFilter: LICENSES,
        images: manifest,
      },
      null,
      2,
    ) + "\n",
  );
  // eslint-disable-next-line no-console
  console.log(`\nwrote ${manifest.length} images + manifest.json to ${OUT_DIR}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
