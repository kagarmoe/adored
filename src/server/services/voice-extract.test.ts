import { describe, expect, it, vi } from "vitest";

// voice-extract.ts begins with `import "server-only"`, a build-time guard that
// throws in the Node test env (Next's bundler resolves it in production). The
// extractor also imports @anthropic-ai/sdk, but constructs the client lazily, so
// nothing hits the network here — these are pure sanitize-function tests.
vi.mock("server-only", () => ({}));

import { sanitizeExtraction } from "./voice-extract";

describe("sanitizeExtraction", () => {
  it("passes through valid short strings and the unit enum", () => {
    expect(
      sanitizeExtraction({
        brand: "Prada",
        color: "black",
        category: "shoulder bag",
        unit: "imperial",
      }),
    ).toEqual({
      brand: "Prada",
      color: "black",
      category: "shoulder bag",
      unit: "imperial",
    });
  });

  it("keeps valid dimensions unchanged", () => {
    expect(sanitizeExtraction({ width: 11, height: 9, unit: "imperial" })).toEqual({
      width: 11,
      height: 9,
      unit: "imperial",
    });
  });

  it("clamps a dimension above 10000 down to 10000 (clamp, not reject)", () => {
    expect(sanitizeExtraction({ width: 15000 })).toEqual({ width: 10000 });
  });

  it("drops non-positive and non-finite dimensions without failing the result", () => {
    expect(sanitizeExtraction({ brand: "Prada", height: 0, depth: -3 })).toEqual({
      brand: "Prada",
    });
    expect(sanitizeExtraction({ brand: "Prada", weight: Infinity })).toEqual({
      brand: "Prada",
    });
  });

  it("strips unknown keys (e.g. story, which belongs to dictation, not extraction)", () => {
    expect(
      sanitizeExtraction({ brand: "Prada", story: "keep me elsewhere", foo: 123 }),
    ).toEqual({ brand: "Prada" });
  });

  it("keeps otherDetails up to 10 short items", () => {
    const items = Array.from({ length: 10 }, (_, i) => `detail ${i}`);
    expect(sanitizeExtraction({ otherDetails: items })).toEqual({
      otherDetails: items,
    });
  });

  it("rejects (null) when otherDetails exceeds 10 items", () => {
    const items = Array.from({ length: 11 }, (_, i) => `detail ${i}`);
    expect(sanitizeExtraction({ otherDetails: items })).toBeNull();
  });

  it("rejects (null) an over-120-character string", () => {
    expect(sanitizeExtraction({ brand: "x".repeat(121) })).toBeNull();
  });

  it("rejects (null) an over-120-character otherDetails entry", () => {
    expect(sanitizeExtraction({ otherDetails: ["x".repeat(121)] })).toBeNull();
  });

  it("returns an empty object for an empty extraction (no-op)", () => {
    expect(sanitizeExtraction({})).toEqual({});
  });
});
