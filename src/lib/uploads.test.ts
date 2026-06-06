import { describe, expect, it } from "vitest";
import { buildJpegFileName, isHeifFile, MAX_UPLOAD_ERROR } from "./uploads";

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
