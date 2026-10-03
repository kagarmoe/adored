import { describe, expect, it } from "vitest";
import type { Collection } from "@/types";
import { collectionsEmptyState, collectionsViewFrom, collectionsViewHref, filterCollections } from "./collectionsList";

const mk = (o: Partial<Collection>): Collection => ({
  id: "c", ownerId: "u", name: "Bags", slug: null, description: null, status: "active",
  createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null, ...o,
});
const ids = (cs: Collection[]) => cs.map((c) => c.id);
const list = [
  mk({ id: "a", name: "Summer bags", description: "Totes (canvas) and clutches" }),
  mk({ id: "b", name: "Grandma's china", status: "archived" }),
  mk({ id: "c", name: "Books" }),
  mk({ id: "d", name: "Odd one", status: "deleted" }),
];

describe("filterCollections", () => {
  it("All is everything not archived (never silently hides a status); Archived is the archived ones", () => {
    expect(ids(filterCollections(list, { view: "all", q: "" }))).toEqual(["a", "c", "d"]);
    expect(ids(filterCollections(list, { view: "archived", q: "" }))).toEqual(["b"]);
  });
  it("searches name and description as plain text, case-insensitive, trimmed — never a pattern", () => {
    expect(ids(filterCollections(list, { view: "all", q: "  TOTES (" }))).toEqual(["a"]);
    expect(ids(filterCollections(list, { view: "all", q: "books" }))).toEqual(["c"]);
    expect(filterCollections(list, { view: "all", q: ".*" })).toEqual([]);
  });
  it("search stays inside the chosen view", () => {
    expect(filterCollections(list, { view: "archived", q: "summer" })).toEqual([]);
  });
});

describe("collectionsViewFrom / collectionsViewHref", () => {
  it("only archived is a view; the retired Active, arrays and junk read as All", () => {
    expect(collectionsViewFrom("archived")).toBe("archived");
    for (const s of ["active", "", undefined, ["archived"], "ARCHIVED"]) expect(collectionsViewFrom(s)).toBe("all");
  });
  it("keeps the query across pills", () => {
    expect(collectionsViewHref("all", "")).toBe("/collections");
    expect(collectionsViewHref("archived", "china")).toBe("/collections?status=archived&q=china");
  });
});

describe("collectionsEmptyState", () => {
  it("speaks gently per case and never counts", () => {
    expect(collectionsEmptyState({ hasAny: true, view: "all", q: " silk " }).heading).toBe("Nothing matches “silk”");
    expect(collectionsEmptyState({ hasAny: true, view: "archived", q: "" }).heading).toBe("Nothing archived");
    expect(collectionsEmptyState({ hasAny: false, view: "all", q: "" })).toEqual({
      heading: "Nothing here yet",
      message: "Start a new collection whenever you’re ready — there’s no rush.",
    });
    expect(collectionsEmptyState({ hasAny: true, view: "all", q: "" })).toEqual({
      heading: "Nothing here right now",
      message: "Your archived collections are under Archived.",
    });
  });
});
