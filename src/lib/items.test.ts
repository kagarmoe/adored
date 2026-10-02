import { describe, expect, it } from "vitest";
import { filterItems, hasName, itemDisplayName, itemInitial, itemSubtitle, itemsEmptyState } from "./items";

const mk = (over: Partial<{ name: string | null; status: string | null; brand: string | null; color: string | null }>) =>
  ({ id: "i", collectionId: "c", number: 1, name: null, status: "active", ...over }) as any;

describe("filterItems", () => {
  const items = [mk({ name: "Weekend tote", brand: "Coach" }), mk({ name: null, color: "Tan" }), mk({ name: "Clutch (red)" })];
  it("matches q case-insensitively across name, brand and the other text fields", () => {
    expect(filterItems(items, { unnamed: false, q: "coach" }).map((i) => i.name)).toEqual(["Weekend tote"]);
    expect(filterItems(items, { unnamed: false, q: "TAN" })).toHaveLength(1);
  });
  it("treats q as plain text, never a pattern", () => {
    expect(filterItems(items, { unnamed: false, q: "(red" }).map((i) => i.name)).toEqual(["Clutch (red)"]);
    expect(filterItems(items, { unnamed: false, q: ".*" })).toEqual([]);
  });
  it("Waiting for a name keeps only nameless items (whitespace counts as nameless)", () => {
    expect(filterItems([...items, mk({ name: "  " })], { unnamed: true, q: "" })).toHaveLength(2);
  });
});

describe("hasName", () => {
  it("is false for null, empty, and whitespace-only names", () => {
    expect(hasName({ name: null })).toBe(false);
    expect(hasName({ name: "" })).toBe(false);
    expect(hasName({ name: "   " })).toBe(false);
  });
  it("is true for a real name", () => {
    expect(hasName({ name: "Bag" })).toBe(true);
  });
});

describe("itemsEmptyState", () => {
  it("everything archived points at Archived, not 'No items yet'", () => {
    expect(itemsEmptyState({ hasAnyItems: false, hasArchived: true, view: "all", q: "" })).toEqual({
      heading: "Everything here is archived",
      message: "Find it under Archived.",
    });
    expect(itemsEmptyState({ hasAnyItems: false, hasArchived: false, view: "all", q: "" }).heading).toBe("No items yet");
  });

  it("speaks gently per view, never counting what's missing", () => {
    expect(itemsEmptyState({ hasAnyItems: false, view: "all", q: "" }).heading).toBe("No items yet");
    expect(itemsEmptyState({ hasAnyItems: true, view: "archived", q: "" }).heading).toBe("Nothing archived");
    expect(itemsEmptyState({ hasAnyItems: true, view: "all", q: "silk" }).heading).toBe("Nothing matches “silk”");
    expect(itemsEmptyState({ hasAnyItems: false, view: "unnamed", q: "" }).heading).toBe("No items yet");
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

describe("itemSubtitle", () => {
  it("names the month added, adding the year only when it isn't this year", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    expect(itemSubtitle({ number: 14, createdAt: new Date("2026-06-03T12:00:00Z") }, now)).toBe("#14 · added in June");
    expect(itemSubtitle({ number: 2, createdAt: new Date("2025-06-03T12:00:00Z") }, now)).toBe("#2 · added in June 2025");
  });
});
