import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

vi.mock("@vercel/blob", () => ({ get: vi.fn(), put: vi.fn() }));
import { get, put } from "@vercel/blob";
import {
  servePhotoFile,
  readStreamCapped,
  RESIZE_WIDTHS,
  RESIZE_MAX_SOURCE_BYTES,
} from "./photo-serving";

const mockGet = get as unknown as ReturnType<typeof vi.fn>;
const mockPut = put as unknown as ReturnType<typeof vi.fn>;

const fixture = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), "e2e/fixtures/sample-images/unit", name));
const cc0 = fixture("plain-1600x973.jpg"); // 1600x973, no EXIF orientation
const exifPhoto = fixture("exif-orient6-4032x3024.jpg"); // 4032x3024, EXIF orientation 6 (portrait)

// Path-aware: a variant-path get MISSES (null) so the resize path falls through
// to fetching+resizing the original (as in sub-project A). Variant HITs are set
// up per-test. The original blobKey always returns a 200.
function mockBlob(buf: Buffer, opts: { contentType?: string; size?: number } = {}) {
  mockGet.mockImplementation(async (key: string) => {
    if (typeof key === "string" && key.startsWith("variants/")) return null;
    return {
      statusCode: 200,
      stream: new Response(new Uint8Array(buf)).body, // fresh stream per call (single-use)
      blob: {
        contentType: opts.contentType ?? "image/jpeg",
        etag: "blob-content-etag",
        size: opts.size ?? buf.byteLength,
      },
    };
  });
  mockPut.mockResolvedValue({ url: "https://blob/variant.webp" });
}

const baseArgs = {
  blobKey: "store/abc.jpg",
  mimeType: "image/jpeg",
  photoId: "p1",
  collectionId: "c1",
  updatedAt: new Date(1_700_000_000_000),
  rotation: 0,
};
const req = (qs = "", headers: Record<string, string> = {}) =>
  new Request(`http://t/file${qs}`, { headers });

describe("servePhotoFile", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
  });

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

  it("resizes a real-sized photo larger than the old 24 MP guard (regression: prod 500s)", async () => {
    // A 30 MP source (6000x5000) — a normal modern phone photo, bigger than the
    // previous limitInputPixels (24 MP). It must resize, not 500.
    const big = await sharp({
      create: { width: 6000, height: 5000, channels: 3, background: { r: 90, g: 110, b: 130 } },
    })
      .jpeg()
      .toBuffer();
    expect(6000 * 5000).toBeGreaterThan(24_000_000); // would have hit the old guard
    mockBlob(big);
    const res = await servePhotoFile(baseArgs, req("?w=640"));
    expect(res.status).toBe(200);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThanOrEqual(640);
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

  it("auto-orients via EXIF so the resized image is upright (rotation 0 -> portrait)", async () => {
    mockBlob(exifPhoto); // orientation 6 -> displayed portrait 3024x4032
    const res = await servePhotoFile(baseArgs, req("?w=320"));
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.width).toBe(320);
    expect(meta.height!).toBeGreaterThan(meta.width!); // .rotate() applied
    expect(meta.orientation).toBeUndefined(); // EXIF orientation tag stripped
  });

  it("composes a stored rotation ON TOP of EXIF orientation (not double-rotated)", async () => {
    // exifPhoto auto-orients to portrait; +90 -> landscape; +180 -> portrait again.
    mockBlob(exifPhoto);
    const m90 = await sharp(
      Buffer.from(await (await servePhotoFile({ ...baseArgs, rotation: 90 }, req("?w=320"))).arrayBuffer()),
    ).metadata();
    expect(m90.width!).toBeGreaterThan(m90.height!); // landscape — one further turn, not sideways-twice

    mockBlob(exifPhoto);
    const m180 = await sharp(
      Buffer.from(await (await servePhotoFile({ ...baseArgs, rotation: 180 }, req("?w=320"))).arrayBuffer()),
    ).metadata();
    expect(m180.height!).toBeGreaterThan(m180.width!); // portrait
  });

  it("re-encodes & orients the passthrough (no ?w=) when rotation != 0", async () => {
    mockBlob(exifPhoto);
    const res = await servePhotoFile({ ...baseArgs, rotation: 90 }, req());
    expect(res.headers.get("Content-Type")).toBe("image/webp"); // not the verbatim jpeg
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.format).toBe("webp");
  });

  it("streams the passthrough verbatim when rotation === 0", async () => {
    mockBlob(cc0, { contentType: "image/jpeg" });
    const res = await servePhotoFile(baseArgs, req());
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    const out = Buffer.from(await res.arrayBuffer());
    expect(out.byteLength).toBe(cc0.byteLength);
  });

});

describe("servePhotoFile — dev-only demo-seed local fallback", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const demoArgs = { ...baseArgs, blobKey: "demo-seed-placeholder/copper-tea-kettle.webp" };
  const localBytes = () =>
    fs.readFileSync(path.join(process.cwd(), "public/onboarding/copper-tea-kettle.webp"));
  const onboardingArgs = { ...baseArgs, blobKey: "demo-seed-placeholder/blue-mixing-bowl.webp" };
  const onboardingBytes = () =>
    fs.readFileSync(path.join(process.cwd(), "public/onboarding/blue-mixing-bowl.webp"));

  it("serves a demo-seed key from the local fixture when Blob misses (dev, no ?w=)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockGet.mockResolvedValue(null); // Blob 404 / miss
    const res = await servePhotoFile(demoArgs, req());
    expect(res.status).toBe(200);
    const out = Buffer.from(await res.arrayBuffer());
    expect(out.byteLength).toBe(localBytes().byteLength);
  });

  it("serves a seeded onboarding image from public/onboarding when Blob misses", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockGet.mockResolvedValue(null);
    const res = await servePhotoFile(onboardingArgs, req());
    expect(res.status).toBe(200);
    const out = Buffer.from(await res.arrayBuffer());
    expect(out.byteLength).toBe(onboardingBytes().byteLength);
  });

  it("resizes a demo-seed key from the local fixture when Blob misses (dev, ?w=)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockGet.mockResolvedValue(null);
    const res = await servePhotoFile(demoArgs, req("?w=320"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.width).toBeLessThanOrEqual(320);
  });

  it("PROD: a demo-seed key that Blob-misses still 404s — no local fallback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockGet.mockResolvedValue(null);
    const res = await servePhotoFile(demoArgs, req());
    expect(res.status).toBe(404);
  });

  it("dev: a NON-demo key that Blob-misses still 404s (fallback is demo-key-scoped)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockGet.mockResolvedValue(null);
    const res = await servePhotoFile(baseArgs, req()); // baseArgs.blobKey = "store/abc.jpg"
    expect(res.status).toBe(404);
  });

  it("dev: prefers Blob when it HITS — local fallback only on miss", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockBlob(cc0, { contentType: "image/jpeg" }); // Blob returns 200
    const res = await servePhotoFile(demoArgs, req());
    expect(res.status).toBe(200);
    const out = Buffer.from(await res.arrayBuffer());
    expect(out.byteLength).toBe(cc0.byteLength); // Blob bytes, not the local fixture
  });
});

describe("readStreamCapped", () => {
  it("returns the full buffer when the stream is under the cap", async () => {
    const stream = new Response(new Uint8Array([1, 2, 3])).body!;
    const buf = await readStreamCapped(stream, 10);
    expect(buf).not.toBeNull();
    expect(buf!.byteLength).toBe(3);
  });

  it("returns null (no OOM) when the stream exceeds the cap", async () => {
    const stream = new Response(new Uint8Array(20)).body!;
    const buf = await readStreamCapped(stream, 10);
    expect(buf).toBeNull();
  });
});

describe("servePhotoFile (continued)", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
  });

  it("returns a generic 500 (no internal detail) when processing throws", async () => {
    // variant MISS → fetch the (bad) original → sharp throws → 500
    mockGet.mockImplementation(async (key: string) => {
      if (typeof key === "string" && key.startsWith("variants/")) return null;
      return {
        statusCode: 200,
        stream: new Response(new Uint8Array(Buffer.from("not an image"))).body,
        blob: { contentType: "image/jpeg", etag: "e", size: 12 },
      };
    });
    const res = await servePhotoFile(baseArgs, req("?w=320"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Image processing failed" });
  });
});

describe("servePhotoFile — persisted variant cache", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
  });

  it("HIT: streams the stored variant without resizing or fetching the original", async () => {
    const variantBytes = await sharp(cc0).resize({ width: 320 }).webp().toBuffer();
    mockGet.mockImplementation(async (key: string) => {
      if (typeof key === "string" && key.startsWith("variants/")) {
        return { statusCode: 200, stream: new Response(new Uint8Array(variantBytes)).body, blob: { contentType: "image/webp", etag: "v", size: variantBytes.byteLength } };
      }
      throw new Error("original should NOT be fetched on a variant HIT");
    });
    mockPut.mockResolvedValue({ url: "x" });

    const res = await servePhotoFile(baseArgs, req("?w=320"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    // HIT reuses the variant ETag (not the blob's content etag) so 304 still matches.
    expect(res.headers.get("ETag")).toBe(`"p1:320:${baseArgs.updatedAt.getTime()}"`);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("MISS: resizes the original, persists the variant (deterministic webp), streams it", async () => {
    mockBlob(cc0);
    const res = await servePhotoFile(baseArgs, req("?w=320"));
    expect(res.status).toBe(200);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.width).toBeLessThanOrEqual(320);
    expect(mockPut).toHaveBeenCalledTimes(1);
    const [pathArg, , opts] = mockPut.mock.calls[0];
    expect(pathArg).toBe(`variants/c1/p1/w320-v${baseArgs.updatedAt.getTime()}.webp`);
    expect(opts).toMatchObject({ access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "image/webp" });
  });

  it("round-trip: the pathname written on MISS is the one read on the next HIT", async () => {
    mockBlob(cc0);
    await servePhotoFile(baseArgs, req("?w=640"));
    const writtenPath = mockPut.mock.calls[0][0] as string;

    const variantBytes = await sharp(cc0).resize({ width: 640 }).webp().toBuffer();
    mockGet.mockReset();
    mockGet.mockImplementation(async (key: string) =>
      key === writtenPath
        ? { statusCode: 200, stream: new Response(new Uint8Array(variantBytes)).body, blob: { contentType: "image/webp", etag: "v", size: 1 } }
        : null,
    );
    const res = await servePhotoFile(baseArgs, req("?w=640"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
  });

  it("best-effort: a variant-get error falls through to an on-the-fly resize (200, not 500)", async () => {
    mockGet.mockImplementation(async (key: string) => {
      if (typeof key === "string" && key.startsWith("variants/")) throw new Error("blob rate limited");
      return { statusCode: 200, stream: new Response(new Uint8Array(cc0)).body, blob: { contentType: "image/jpeg", etag: "e", size: cc0.byteLength } };
    });
    mockPut.mockResolvedValue({ url: "x" });
    const res = await servePhotoFile(baseArgs, req("?w=320"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
  });

  it("best-effort: a variant put() rejection still returns the resized bytes (200)", async () => {
    mockBlob(cc0);
    mockPut.mockRejectedValue(new Error("BlobAlreadyExists"));
    const res = await servePhotoFile(baseArgs, req("?w=320"));
    expect(res.status).toBe(200);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.format).toBe("webp");
  });

  it("version busts the variant pathname (rotation/edit → new key)", async () => {
    mockBlob(cc0);
    await servePhotoFile(baseArgs, req("?w=320"));
    await servePhotoFile({ ...baseArgs, updatedAt: new Date(baseArgs.updatedAt.getTime() + 1000) }, req("?w=320"));
    expect(mockPut.mock.calls[0][0]).not.toBe(mockPut.mock.calls[1][0]);
  });

  it("passthrough (no ?w=) never touches the variant store", async () => {
    mockBlob(cc0, { contentType: "image/jpeg" });
    await servePhotoFile(baseArgs, req());
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalledWith(expect.stringMatching(/^variants\//), expect.anything());
  });
});
