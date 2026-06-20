import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import sharp from "sharp";
import { getBlobAccess } from "@/lib/photos";

/** Widths a card/grid/hero may request via `?w=`. One per surface; `unoptimized`
 *  precludes srcset, so we pick a single 2x-friendly width per surface. */
export const RESIZE_WIDTHS = [160, 320, 640, 1280] as const;
/** Refuse to buffer a source larger than this (decode-bomb / OOM guard). */
export const RESIZE_MAX_SOURCE_BYTES = 25_000_000;
/** sharp refuses to decode an image whose pixel count exceeds this (decode-bomb guard). */
const LIMIT_INPUT_PIXELS = 24_000_000;
/** Cache 5 min then revalidate — keeps the byte-savings while re-running authz
 *  every 5 min (not `immutable`: these are private images on shared tablets). */
const CACHE_CONTROL = "private, max-age=300, must-revalidate";

interface ServeArgs {
  blobKey: string;
  mimeType: string;
  photoId: string;
  updatedAt: Date;
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

/**
 * Serve a photo's bytes with caching + optional on-demand resize. Owns the
 * variant ETag end-to-end: it does NOT forward the client's If-None-Match into
 * the blob get() (whose etag is the blob's *content* etag — a different
 * namespace). Call ONLY after the route's authz has passed.
 */
export async function servePhotoFile(
  { blobKey, mimeType, photoId, updatedAt }: ServeArgs,
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
    const result = await get(blobKey, { access: getBlobAccess(blobKey) });
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (width === null) {
      return new NextResponse(result.stream, {
        headers: {
          "Content-Type": result.blob.contentType || mimeType,
          "Cache-Control": CACHE_CONTROL,
          ETag: etag,
        },
      });
    }

    // Fast-reject a known-huge blob without reading it; the capped reader then
    // bounds the read for unknown/mis-reported sizes too.
    if (result.blob.size != null && result.blob.size > RESIZE_MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "Image too large to process" }, { status: 400 });
    }
    const buf = await readStreamCapped(result.stream, RESIZE_MAX_SOURCE_BYTES);
    if (!buf) {
      return NextResponse.json({ error: "Image too large to process" }, { status: 400 });
    }
    const out = await sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "truncated" })
      .rotate() // EXIF auto-orient, then strips the orientation tag
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return new NextResponse(new Uint8Array(out), {
      headers: { "Content-Type": "image/webp", "Cache-Control": CACHE_CONTROL, ETag: etag },
    });
  } catch (error) {
    console.error("servePhotoFile failed", { photoId, width, error });
    return NextResponse.json({ error: "Image processing failed" }, { status: 500 });
  }
}
