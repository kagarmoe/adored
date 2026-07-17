import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { NextResponse } from "next/server";
import { get, put } from "@vercel/blob";
import sharp from "sharp";
import { getBlobAccess } from "@/lib/photos";
import { variantPath } from "@/lib/photo-variants";

/** Widths a card/grid/hero may request via `?w=`. One per surface; `unoptimized`
 *  precludes srcset, so we pick a single 2x-friendly width per surface. */
export const RESIZE_WIDTHS = [160, 320, 640, 1280] as const;
/** Refuse to buffer a source larger than this (decode-bomb / OOM guard). */
export const RESIZE_MAX_SOURCE_BYTES = 25_000_000;
/** sharp refuses to decode an image whose pixel count exceeds this (decode-bomb
 *  backstop). 100 MP comfortably clears real photos — incl. 48 MP iPhone shots —
 *  while still blocking a pathological PNG that decodes to hundreds of MP. The
 *  RESIZE_MAX_SOURCE_BYTES byte ceiling is the primary OOM guard; this is the
 *  secondary one. (Was 24 MP, which wrongly rejected real >24 MP phone photos.) */
const LIMIT_INPUT_PIXELS = 100_000_000;
/** Cache 5 min then revalidate — keeps the byte-savings while re-running authz
 *  every 5 min (not `immutable`: these are private images on shared tablets). */
const CACHE_CONTROL = "private, max-age=300, must-revalidate";

interface ServeArgs {
  blobKey: string;
  mimeType: string;
  photoId: string;
  collectionId: string;
  updatedAt: Date;
  /** Stored bowlwise rotation (0|90|180|270), applied on top of EXIF auto-orient. */
  rotation: number;
}

/** Strong ETag of the *variant identity*: photo + width + version. `updatedAt`
 *  is the version, so any logical change (e.g. rotation) yields a fresh ETag. */
function variantEtag(photoId: string, w: number | "orig", updatedAt: Date): string {
  return `"${photoId}:${w}:${updatedAt.getTime()}"`;
}

/** Read a web ReadableStream into a Buffer, returning null if it exceeds
 *  `maxBytes`. Bounds memory even when the blob's reported size is missing or
 *  wrong, so a mis-sized source can never OOM the function before the guard. */
export async function readStreamCapped(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Buffer | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Seed placeholder key prefix (see scripts/seed-load.ts). A photo carrying this
 *  key has no real Blob object — its bytes live in committed local fixtures —
 *  so it is the explicit marker that gates the dev-only fallback. */
const DEMO_SEED_PREFIX = "demo-seed-placeholder/";
const DEMO_IMAGE_DIRS = [join(process.cwd(), "public", "onboarding")];

/** A `get()`-shaped success result over a Buffer, so the fallback slots into the
 *  same code paths as a real Blob hit. */
function bufferResult(buf: Buffer, contentType: string) {
  return {
    statusCode: 200 as const,
    stream: new Response(new Uint8Array(buf)).body!,
    blob: { contentType, size: buf.byteLength },
  };
}

/**
 * ponytail: DEV-ONLY read fallback — the ceiling is `NODE_ENV !== "production"`
 * AND the demo-seed marker key, so it can never serve local bytes for a real
 * photo or in prod. Seeded demo collections carry a `demo-seed-placeholder/<file>`
 * blobKey with no Blob object; in dev (no Blob token) map that key to a committed
 * local fixture so seeded/demo photos render. Returns null when it doesn't apply.
 */
function devDemoFallback(blobKey: string): ReturnType<typeof bufferResult> | null {
  if (process.env.NODE_ENV === "production" || !blobKey.startsWith(DEMO_SEED_PREFIX)) {
    return null;
  }
  const filename = basename(blobKey); // basename: no path traversal
  for (const dir of DEMO_IMAGE_DIRS) {
    const file = join(dir, filename);
    if (existsSync(file)) return bufferResult(readFileSync(file), "image/webp");
  }
  return null;
}

/** Fetch the original bytes from Blob, degrading to the dev-only demo fallback on
 *  a miss/failure. Callers treat a null return as a 404. */
async function fetchOriginal(blobKey: string): Promise<ReturnType<typeof bufferResult> | Awaited<ReturnType<typeof get>>> {
  try {
    const result = await get(blobKey, { access: getBlobAccess(blobKey) });
    if (result && result.statusCode === 200) return result;
  } catch (error) {
    if (process.env.NODE_ENV === "production") throw error;
    // dev: a Blob error (e.g. rejected token) falls through to the demo fallback.
  }
  return devDemoFallback(blobKey);
}

/**
 * Serve a photo's bytes with caching + optional on-demand resize. Owns the
 * variant ETag end-to-end (does NOT forward the client's If-None-Match into the
 * blob get). Call ONLY after the route's authz has passed.
 *
 * Resized variants are persisted back to Blob (resize-once-globally): on a HIT
 * the stored webp is streamed without fetching or decoding the original. The
 * variant store is BEST-EFFORT — any variant get/put failure degrades to an
 * on-the-fly resize, never a broken image.
 */
export async function servePhotoFile(
  { blobKey, mimeType, photoId, collectionId, updatedAt, rotation }: ServeArgs,
  request: Request,
): Promise<NextResponse> {
  const wParam = new URL(request.url).searchParams.get("w");
  let width: number | null = null;
  if (wParam !== null) {
    const n = Number(wParam);
    if (!Number.isInteger(n) || !(RESIZE_WIDTHS as readonly number[]).includes(n)) {
      return NextResponse.json({ error: "Unsupported width" }, { status: 400 });
    }
    width = n;
  }

  const etag = variantEtag(photoId, width ?? "orig", updatedAt);
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": CACHE_CONTROL },
    });
  }

  try {
    // Original passthrough (no ?w=): stream verbatim, or re-encode/orient when a
    // user rotation is stored so /file is orientation-correct without a variant.
    if (width === null) {
      const result = await fetchOriginal(blobKey);
      if (!result || result.statusCode !== 200) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (rotation === 0) {
        return new NextResponse(result.stream, {
          headers: {
            "Content-Type": result.blob.contentType || mimeType,
            "Cache-Control": CACHE_CONTROL,
            ETag: etag,
          },
        });
      }
      const orig = await readStreamCapped(result.stream, RESIZE_MAX_SOURCE_BYTES);
      if (!orig) {
        return NextResponse.json({ error: "Image too large to process" }, { status: 400 });
      }
      const rotated = await sharp(orig, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "truncated" })
        .rotate()
        .rotate(rotation)
        .webp({ quality: 80 })
        .toBuffer();
      return webpResponse(rotated, etag);
    }

    // Resize path — persisted variant get-or-create (best-effort cache).
    const vPath = variantPath(collectionId, photoId, width, updatedAt.getTime());
    let variant: Awaited<ReturnType<typeof get>> = null;
    try {
      variant = await get(vPath, { access: "private" });
    } catch {
      variant = null; // a transient blob error is a cache miss, not a failure
    }
    if (variant && variant.statusCode === 200) {
      // Reuse the variant ETag (NOT the blob's content etag) so 304 still matches.
      return new NextResponse(variant.stream, {
        headers: { "Content-Type": "image/webp", "Cache-Control": CACHE_CONTROL, ETag: etag },
      });
    }

    // MISS: fetch the original, resize, persist (best-effort), stream.
    const result = await fetchOriginal(blobKey);
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.blob.size != null && result.blob.size > RESIZE_MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "Image too large to process" }, { status: 400 });
    }
    const buf = await readStreamCapped(result.stream, RESIZE_MAX_SOURCE_BYTES);
    if (!buf) {
      return NextResponse.json({ error: "Image too large to process" }, { status: 400 });
    }
    const out = await sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "truncated" })
      .rotate() // EXIF auto-orient, then strips the orientation tag
      .rotate(rotation) // user's stored bowlwise turn on top (0 = no-op)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    try {
      await put(vPath, out, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true, // deterministic bytes — a concurrent double-miss is safe
        contentType: "image/webp",
      });
    } catch (error) {
      // A cache-write race/outage must never fail the response; we re-resize next time.
      console.error("variant persist failed (orphaned/none, will re-resize)", { vPath, error });
    }
    return webpResponse(out, etag);
  } catch (error) {
    console.error("servePhotoFile failed", { photoId, width, error });
    return NextResponse.json({ error: "Image processing failed" }, { status: 500 });
  }
}

function webpResponse(bytes: Buffer, etag: string): NextResponse {
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/webp", "Cache-Control": CACHE_CONTROL, ETag: etag },
  });
}
