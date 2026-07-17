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
  itemEdit: trail.itemEdit(c, item),
  itemPhotos: trail.itemPhotos(c, item),
  sort: trail.sort(c),
  sortNew: trail.sortNew(c),
  setAside: trail.setAside(c),
  session: trail.session(c, 3),
  triage: trail.triage(c, 3),
  compare: trail.compare(c, 3),
  usage: trail.usage(c, 3),
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

  it("drops the item crumb's link (and so the arrow) for a null item number", () => {
    // The one documented exception to the invariant above: rather than mint a
    // broken href, a number-less item leaves its crumb unlinked.
    expect(trail.itemEdit(c, { name: "Red Clutch", number: null }).at(-2)).toEqual({
      label: "Red Clutch",
    });
  });

  it("uses the chip vocabulary: Sort and Decide", () => {
    expect(trail.sort(c).at(-1)).toEqual({ label: "Sort" });
    expect(trail.results(c).at(-1)).toEqual({ label: "Decide" });
  });

  it("parents Set aside under Decide and Session under Sort", () => {
    expect(trail.setAside(c).at(-2)).toEqual({
      label: "Decide",
      href: "/collections/spring-bags/results",
    });
    expect(trail.session(c, 3)).toEqual([
      { label: "Collections", href: "/collections" },
      { label: "Spring Bags", href: "/collections/spring-bags" },
      { label: "Sort", href: "/collections/spring-bags/sort" },
      { label: "Session" },
    ]);
    expect(trail.compare(c, 3).at(-2)).toEqual({
      label: "Session",
      href: "/collections/spring-bags/sort/3",
    });
  });

  it("falls back to the collection id when there is no slug", () => {
    expect(trail.items(noSlug).at(-2)?.href).toBe("/collections/col-2");
  });

  it("labels items via itemDisplayName", () => {
    expect(trail.item(c, item).at(-1)).toEqual({ label: "Red Clutch" });
    expect(trail.itemEdit(c, { name: null, number: 7 }).at(-2)).toEqual({
      label: "#7",
      href: "/collections/spring-bags/items/7",
    });
  });
});
