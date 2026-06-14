import { describe, expect, it } from "vitest";
import { filterItems, itemDisplayName, itemInitial } from "./items";

const mk = (over: Partial<{ name: string | null; status: string | null }>) =>
  ({ id: "i", collectionId: "c", number: 1, name: null, status: "active", ...over }) as any;

describe("filterItems", () => {
  const items = [
    mk({ name: "Bag", status: "active" }),
    mk({ name: null, status: "active" }),
    mk({ name: null, status: "archived" }),
  ];
  it("returns all when status=all and unnamed=false", () => {
    expect(filterItems(items, { status: "all", unnamed: false })).toHaveLength(3);
  });
  it("filters to nameless when unnamed=true", () => {
    const r = filterItems(items, { status: "all", unnamed: true });
    expect(r).toHaveLength(2);
    expect(r.every((i) => !i.name)).toBe(true);
  });
  it("applies status and unnamed together", () => {
    const r = filterItems(items, { status: "active", unnamed: true });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: null, status: "active" });
  });
  it("treats missing status as active", () => {
    const r = filterItems([mk({ name: "x", status: null })], { status: "active", unnamed: false });
    expect(r).toHaveLength(1);
  });
});

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

  it("returns a neutral mark for a nameless item, regardless of number", () => {
    expect(itemInitial({ name: null, number: 3 })).toBe("•");
  });

  it("returns a neutral glyph when there is nothing", () => {
    expect(itemInitial({ name: null, number: null })).toBe("•");
  });
});
