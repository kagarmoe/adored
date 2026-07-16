// Stamps each e2e base photo with its spec name so a failure screenshot
// identifies the spec that produced it. Run by e2e/global-setup.ts; safe to
// run manually: node scripts/label-test-images.mjs
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";

const ROOT = join(process.cwd(), "e2e", "fixtures", "sample-images");
const BASE = join(ROOT, "base");
const OUT = join(ROOT, "labeled");
const MIN_BYTES = 1024;

const files = readdirSync(BASE).filter((f) => f.endsWith(".webp"));
if (files.length === 0) throw new Error(`no base images in ${BASE}`);
mkdirSync(OUT, { recursive: true });

for (const file of files) {
  const spec = basename(file, ".webp");
  const src = sharp(join(BASE, file));
  const { width = 1200, height = 900 } = await src.metadata();
  const bar = Math.max(48, Math.round(height * 0.12));
  const fontSize = Math.round(bar * 0.45);
  const svg = `<svg width="${width}" height="${height}">
    <rect x="0" y="${height - bar}" width="${width}" height="${bar}" fill="#3a1208" opacity="0.9"/>
    <text x="${width / 2}" y="${height - bar / 2}" font-family="Helvetica, Arial, sans-serif"
      font-size="${fontSize}" font-weight="bold" fill="#ffffff"
      text-anchor="middle" dominant-baseline="central">${spec}</text>
  </svg>`;
  // no .withMetadata(): sharp's default output strips any source EXIF/XMP
  await src.composite([{ input: Buffer.from(svg) }]).webp({ quality: 80 }).toFile(join(OUT, file));
}

for (const file of files) {
  const size = statSync(join(OUT, file)).size;
  if (size < MIN_BYTES) throw new Error(`labeled output too small: ${file} (${size}B)`);
}
console.log(`labeled ${files.length} test images -> ${OUT}`);
