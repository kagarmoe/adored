import { describe, expect, it } from "vitest";
import { basename } from "node:path";
import { SAMPLE_ITEMS } from "@/features/onboarding/sampleData";
import { loadDemoImages, seedItemNameFor } from "./seed-load-core";

describe("seed-load-core onboarding sample declarations", () => {
  it("loads the committed onboarding images in sampleData order", () => {
    const images = loadDemoImages();

    expect(images.map((image) => image.filename)).toEqual(
      SAMPLE_ITEMS.map((item) => basename(item.imageSrc)),
    );
    expect(images.every((image) => image.contentType === "image/webp")).toBe(true);
    expect(images.every((image) => image.buffer.byteLength > 0)).toBe(true);
  });

  it("names seeded DB items from the same sampleData pool", () => {
    expect(seedItemNameFor(0)).toBe(SAMPLE_ITEMS[0].name);
    expect(seedItemNameFor(SAMPLE_ITEMS.length)).toBe(SAMPLE_ITEMS[0].name);
  });
});
