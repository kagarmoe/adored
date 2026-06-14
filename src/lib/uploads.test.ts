// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildJpegFileName,
  isHeifFile,
  MAX_UPLOAD_ERROR,
  partitionPoolFiles,
  POOL_MAX_BYTES,
} from "./uploads";

function makeFile(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("uploads helpers", () => {
  it("identifies heif and heic files by mime type or extension", () => {
    expect(isHeifFile({ name: "bag.HEIC", type: "application/octet-stream" } as File)).toBe(true);
    expect(isHeifFile({ name: "bag.jpg", type: "image/heif" } as File)).toBe(true);
    expect(isHeifFile({ name: "bag.jpg", type: "image/jpeg" } as File)).toBe(false);
  });

  it("rewrites filenames to .jpg", () => {
    expect(buildJpegFileName("bag.heic")).toBe("bag.jpg");
    expect(buildJpegFileName("bag.large.heif")).toBe("bag.large.jpg");
    expect(buildJpegFileName("bag")).toBe("bag.jpg");
  });

  it("keeps the shared upload limit message stable", () => {
    expect(MAX_UPLOAD_ERROR).toBe("Image must be 4.5 MB or smaller");
  });
});

describe("partitionPoolFiles", () => {
  it("accepts a jpeg under the cap", () => {
    const { accepted, skipped } = partitionPoolFiles([makeFile("a.jpg", "image/jpeg")]);
    expect(accepted.map((f) => f.name)).toEqual(["a.jpg"]);
    expect(skipped).toEqual([]);
  });

  it("accepts a png", () => {
    const { accepted, skipped } = partitionPoolFiles([makeFile("a.png", "image/png")]);
    expect(accepted.map((f) => f.name)).toEqual(["a.png"]);
    expect(skipped).toEqual([]);
  });

  it("skips an avif as an unsupported format", () => {
    const { accepted, skipped } = partitionPoolFiles([makeFile("a.avif", "image/avif")]);
    expect(accepted).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].name).toBe("a.avif");
    expect(skipped[0].reason).toMatch(/Unsupported/i);
  });

  it("skips an svg as an unsupported format", () => {
    const { accepted, skipped } = partitionPoolFiles([makeFile("a.svg", "image/svg+xml")]);
    expect(accepted).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].name).toBe("a.svg");
    expect(skipped[0].reason).toMatch(/Unsupported/i);
  });

  it("accepts a HEIC file by mime type (it will be converted to jpeg)", () => {
    const { accepted, skipped } = partitionPoolFiles([makeFile("a.heic", "image/heic")]);
    expect(accepted.map((f) => f.name)).toEqual(["a.heic"]);
    expect(skipped).toEqual([]);
  });

  it("accepts a HEIC file by extension even with an empty type", () => {
    const { accepted, skipped } = partitionPoolFiles([makeFile("a.heic", "")]);
    expect(accepted.map((f) => f.name)).toEqual(["a.heic"]);
    expect(skipped).toEqual([]);
  });

  it("skips a jpeg over the size cap", () => {
    const { accepted, skipped } = partitionPoolFiles([
      makeFile("big.jpg", "image/jpeg", POOL_MAX_BYTES + 1),
    ]);
    expect(accepted).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].name).toBe("big.jpg");
    expect(skipped[0].reason).toMatch(/too large|50 MB/i);
  });

  it("partitions mixed input while preserving order", () => {
    const files = [
      makeFile("ok1.jpg", "image/jpeg"),
      makeFile("bad.avif", "image/avif"),
      makeFile("ok2.png", "image/png"),
      makeFile("big.webp", "image/webp", POOL_MAX_BYTES + 1),
      makeFile("ok3.heic", "image/heic"),
    ];
    const { accepted, skipped } = partitionPoolFiles(files);
    expect(accepted.map((f) => f.name)).toEqual(["ok1.jpg", "ok2.png", "ok3.heic"]);
    expect(skipped.map((s) => s.name)).toEqual(["bad.avif", "big.webp"]);
  });
});
