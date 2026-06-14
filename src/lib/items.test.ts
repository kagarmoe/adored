import { describe, expect, it } from "vitest";
import { itemDisplayName, itemInitial } from "./items";

describe("itemDisplayName", () => {
  it("uses the name when present", () => {
    expect(itemDisplayName({ name: "Red tote", number: 3 })).toBe("Red tote");
  });

  it("falls back to #<number> for a nameless numbered item", () => {
    expect(itemDisplayName({ name: null, number: 3 })).toBe("#3");
  });

  it("falls back to 'Untitled' when there is neither name nor number", () => {
    expect(itemDisplayName({ name: null, number: null })).toBe("Untitled");
  });

  it("treats a blank/whitespace name as no name", () => {
    expect(itemDisplayName({ name: "   ", number: 3 })).toBe("#3");
  });
});

describe("itemInitial", () => {
  it("returns the first letter of the name, uppercased", () => {
    expect(itemInitial({ name: "tote", number: 3 })).toBe("T");
  });

  it("returns the number for a nameless item", () => {
    expect(itemInitial({ name: null, number: 3 })).toBe("3");
  });

  it("returns a neutral glyph when there is nothing", () => {
    expect(itemInitial({ name: null, number: null })).toBe("•");
  });
});
