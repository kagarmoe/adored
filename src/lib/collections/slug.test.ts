import { describe, it, expect } from "vitest";
import { slugifyName, RESERVED_COLLECTION_SLUGS } from "./slug";

describe("slugifyName", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugifyName("Summer Bags")).toBe("summer-bags");
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugifyName("  Kim's   Purses!! ")).toBe("kims-purses");
  });

  it("replaces underscores with hyphens (so a slug never contains _)", () => {
    expect(slugifyName("coll_xyz")).toBe("coll-xyz");
  });

  it("returns empty string for emoji/non-Latin-only names", () => {
    expect(slugifyName("👜👜")).toBe("");
  });

  it("truncates to 40 chars without a trailing hyphen", () => {
    const out = slugifyName("a".repeat(60));
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith("-")).toBe(false);
  });

  it("reserves the static 'new' route", () => {
    expect(RESERVED_COLLECTION_SLUGS.has("new")).toBe(true);
  });
});
