import { describe, expect, it } from "vitest";
import { trail } from "./breadcrumb-trails";

const c = { id: "col-1", slug: "spring-bags", name: "Spring Bags" };
const noSlug = { id: "col-2", slug: null, name: "Winter Coats" };
const item = { name: "Red Clutch", number: 4 };
const result = { number: 2, name: "Second pass" };

// Every builder exercised once, so the well-formedness invariant covers them all.
const allTrails: Record<string, { label: string; href?: string }[]> = {
  collections: trail.collections(),
  collectionNew: trail.collectionNew(),
  collection: trail.collection(c),
  collectionEdit: trail.collectionEdit(c),
  members: trail.members(c),
  pool: trail.pool(c),
  items: trail.items(c),
  itemNew: trail.itemNew(c),
  item: trail.item(c, item),
  sort: trail.sort(c),
  setAside: trail.setAside(c),
  results: trail.results(c),
  result: trail.result(c, result),
  finalize: trail.finalize(c, result),
};

describe("breadcrumb trails", () => {
  it("covers every builder — a new trail must join the invariant check", () => {
    expect(Object.keys(allTrails).sort()).toEqual(Object.keys(trail).sort());
  });

  it("every non-last crumb has an href (back-arrow invariant)", () => {
    for (const [name, crumbs] of Object.entries(allTrails)) {
      expect(crumbs.length, name).toBeGreaterThan(0);
      for (const crumb of crumbs.slice(0, -1)) {
        expect(crumb.href, `${name}: "${crumb.label}"`).toBeTruthy();
      }
    }
  });

  it("uses the chip vocabulary: Sort and Decide", () => {
    expect(trail.sort(c).at(-1)).toEqual({ label: "Sort" });
    expect(trail.results(c).at(-1)).toEqual({ label: "Decide" });
  });

  it("parents Set aside under Decide", () => {
    expect(trail.setAside(c).at(-2)).toEqual({
      label: "Decide",
      href: "/collections/spring-bags/results",
    });
  });

  it("falls back to the collection id when there is no slug", () => {
    expect(trail.items(noSlug).at(-2)?.href).toBe("/collections/col-2");
  });

  it("labels items via itemDisplayName", () => {
    expect(trail.item(c, item).at(-1)).toEqual({ label: "Red Clutch" });
  });
});
