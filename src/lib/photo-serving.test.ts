import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

vi.mock("@vercel/blob", () => ({ get: vi.fn() }));
import { get } from "@vercel/blob";
import { servePhotoFile, RESIZE_WIDTHS, RESIZE_MAX_SOURCE_BYTES } from "./photo-serving";

const mockGet = get as unknown as ReturnType<typeof vi.fn>;

const fixture = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), "e2e/fixtures/photos", name));
const cc0 = fixture("cc0-01.jpg"); // 1600x973, no EXIF orientation
const exifPhoto = fixture("IMG_0428.jpeg"); // 4032x3024, EXIF orientation 6 (portrait)

function mockBlob(buf: Buffer, opts: { contentType?: string; size?: number } = {}) {
  // fresh stream per call — a ReadableStream is single-use
  mockGet.mockImplementation(async () => ({
    statusCode: 200,
    stream: new Response(new Uint8Array(buf)).body,
    blob: {
      contentType: opts.contentType ?? "image/jpeg",
      etag: "blob-content-etag",
      size: opts.size ?? buf.byteLength,
    },
  }));
}

const baseArgs = {
  blobKey: "store/abc.jpg",
  mimeType: "image/jpeg",
  photoId: "p1",
  updatedAt: new Date(1_700_000_000_000),
};
const req = (qs = "", headers: Record<string, string> = {}) =>
  new Request(`http://t/file${qs}`, { headers });

describe("servePhotoFile", () => {
  beforeEach(() => mockGet.mockReset());

  it("serves the original verbatim (no resize) when no width is requested", async () => {
    mockBlob(cc0, { contentType: "image/jpeg" });
    const res = await servePhotoFile(baseArgs, req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
    expect(res.headers.get("Cache-Control")).toContain("must-revalidate");
    expect(res.headers.get("ETag")).toBeTruthy();
    const out = Buffer.from(await res.arrayBuffer());
    expect(out.byteLength).toBe(cc0.byteLength);
  });

  it("does NOT forward the client If-None-Match into the blob get (variant ETag is owned app-side)", async () => {
    mockBlob(cc0);
    await servePhotoFile(baseArgs, req("", { "if-none-match": '"some-old-etag"' }));
    expect(mockGet).toHaveBeenCalledWith(
      "store/abc.jpg",
      expect.not.objectContaining({ ifNoneMatch: expect.anything() }),
    );
  });

  it.each([...RESIZE_WIDTHS])("resizes to webp at allowlisted width %i", async (w) => {
    mockBlob(cc0);
    const res = await servePhotoFile(baseArgs, req(`?w=${w}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    const out = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThanOrEqual(w);
    expect(out.byteLength).toBeLessThan(cc0.byteLength);
  });

  it("rejects a non-allowlisted width with 400, before fetching the blob", async () => {
    mockBlob(cc0);
    expect((await servePhotoFile(baseArgs, req("?w=999"))).status).toBe(400);
    expect((await servePhotoFile(baseArgs, req("?w=abc"))).status).toBe(400);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("rejects an oversized source with 400 (decode-bomb guard)", async () => {
    mockBlob(cc0, { size: RESIZE_MAX_SOURCE_BYTES + 1 });
    const res = await servePhotoFile(baseArgs, req("?w=320"));
    expect(res.status).toBe(400);
  });

  it("returns 304 without fetching the blob when If-None-Match matches the variant ETag", async () => {
    mockBlob(cc0);
    const first = await servePhotoFile(baseArgs, req("?w=320"));
    const etag = first.headers.get("ETag")!;
    mockGet.mockClear();
    const res = await servePhotoFile(baseArgs, req("?w=320", { "if-none-match": etag }));
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("changes the ETag when updatedAt changes (cache-bust on mutation)", async () => {
    mockBlob(cc0);
    const a = await servePhotoFile(baseArgs, req("?w=320"));
    const b = await servePhotoFile(
      { ...baseArgs, updatedAt: new Date(baseArgs.updatedAt.getTime() + 1000) },
      req("?w=320"),
    );
    expect(a.headers.get("ETag")).not.toBe(b.headers.get("ETag"));
  });

  it("auto-orients via EXIF so the resized image is upright (portrait stays portrait)", async () => {
    mockBlob(exifPhoto); // orientation 6 -> displayed portrait 3024x4032
    const res = await servePhotoFile(baseArgs, req("?w=320"));
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.width).toBe(320);
    expect(meta.height!).toBeGreaterThan(meta.width!); // .rotate() applied
    expect(meta.orientation).toBeUndefined(); // EXIF orientation tag stripped
  });

  it("returns a generic 500 (no internal detail) when processing throws", async () => {
    mockGet.mockImplementation(async () => ({
      statusCode: 200,
      stream: new Response(new Uint8Array(Buffer.from("not an image"))).body,
      blob: { contentType: "image/jpeg", etag: "e", size: 12 },
    }));
    const res = await servePhotoFile(baseArgs, req("?w=320"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Image processing failed" });
  });
});
