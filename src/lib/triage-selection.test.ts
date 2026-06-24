import { describe, it, expect } from "vitest";
import { selectTriageItem } from "./triage-selection";
import type { Item, Disposition } from "@/types";

const item = (id: string): Item => ({ id, collectionId: "c", name: id, brand: null, style: null, color: null, material: null, category: null, number: null, height: null, width: null, depth: null, weight: null, unit: "imperial", status: null, notes: null, createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null });

describe("selectTriageItem", () => {
  it("returns the first untriaged, non-disposed item", () => {
    const r = selectTriageItem([item("a"), item("b")], new Set(), new Map());
    expect(r.item?.id).toBe("a");
    expect(r.showingDeferred).toBe(false);
  });

  it("skips already-triaged items to the next untriaged one", () => {
    const r = selectTriageItem([item("a"), item("b"), item("c")], new Set(["a"]), new Map());
    expect(r.item?.id).toBe("b");
    expect(r.showingDeferred).toBe(false);
  });

  it("excludes set_aside items entirely", () => {
    const r = selectTriageItem([item("a"), item("b")], new Set(), new Map([["a", "set_aside" as Disposition]]));
    expect(r.item?.id).toBe("b");
    expect(r.showingDeferred).toBe(false);
  });

  it("defers 'deferred' items to the end (active items come first)", () => {
    const disp = new Map<string, Disposition>([["a", "deferred"]]);
    const r = selectTriageItem([item("a"), item("b")], new Set(), disp);
    expect(r.item?.id).toBe("b"); // b is active, comes before deferred a
    expect(r.showingDeferred).toBe(false);
  });

  it("resurfaces a deferred item once all active items are triaged", () => {
    const disp = new Map<string, Disposition>([["a", "deferred"]]);
    const r = selectTriageItem([item("a"), item("b")], new Set(["b"]), disp);
    expect(r.item?.id).toBe("a"); // b triaged → only deferred a remains
    expect(r.showingDeferred).toBe(true);
  });

  it("sets showingDeferred when only deferred items remain", () => {
    const disp = new Map<string, Disposition>([["a", "deferred"]]);
    const r = selectTriageItem([item("a")], new Set(), disp);
    expect(r.item?.id).toBe("a");
    expect(r.showingDeferred).toBe(true);
  });

  it("does not set showingDeferred while an active item is still available", () => {
    const disp = new Map<string, Disposition>([
      ["a", "deferred"],
      ["b", "deferred"],
    ]);
    const r = selectTriageItem([item("a"), item("b"), item("c")], new Set(), disp);
    expect(r.item?.id).toBe("c"); // c is the only active item
    expect(r.showingDeferred).toBe(false);
  });

  it("returns null and showingDeferred false when everything is triaged", () => {
    const r = selectTriageItem([item("a")], new Set(["a"]), new Map());
    expect(r.item).toBeNull();
    expect(r.showingDeferred).toBe(false);
  });

  it("returns null and showingDeferred false when everything is set aside", () => {
    const r = selectTriageItem([item("a")], new Set(), new Map([["a", "set_aside" as Disposition]]));
    expect(r.item).toBeNull();
    expect(r.showingDeferred).toBe(false);
  });

  it("returns null for an empty item list", () => {
    const r = selectTriageItem([], new Set(), new Map());
    expect(r.item).toBeNull();
    expect(r.showingDeferred).toBe(false);
  });

  it("preserves the input order among active candidates", () => {
    const r = selectTriageItem([item("c"), item("a"), item("b")], new Set(), new Map());
    expect(r.item?.id).toBe("c"); // first in the array wins, not alphabetical
    expect(r.showingDeferred).toBe(false);
  });

  it("preserves input order among deferred candidates when resurfacing", () => {
    const disp = new Map<string, Disposition>([
      ["a", "deferred"],
      ["b", "deferred"],
    ]);
    const r = selectTriageItem([item("b"), item("a")], new Set(), disp);
    expect(r.item?.id).toBe("b"); // first deferred in input order
    expect(r.showingDeferred).toBe(true);
  });

  it("handles a mixed set: triaged + active + deferred + set_aside", () => {
    // a: triaged, b: set_aside, c: deferred, d: active → d is next
    const disp = new Map<string, Disposition>([
      ["b", "set_aside"],
      ["c", "deferred"],
    ]);
    const r = selectTriageItem(
      [item("a"), item("b"), item("c"), item("d")],
      new Set(["a"]),
      disp,
    );
    expect(r.item?.id).toBe("d");
    expect(r.showingDeferred).toBe(false);
  });

  it("resurfaces deferred in a mixed set once the active item is triaged", () => {
    // a: triaged, b: set_aside, c: deferred, d: now also triaged → c resurfaces
    const disp = new Map<string, Disposition>([
      ["b", "set_aside"],
      ["c", "deferred"],
    ]);
    const r = selectTriageItem(
      [item("a"), item("b"), item("c"), item("d")],
      new Set(["a", "d"]),
      disp,
    );
    expect(r.item?.id).toBe("c");
    expect(r.showingDeferred).toBe(true);
  });

  it("never resurfaces a set_aside item even when only it remains", () => {
    const r = selectTriageItem(
      [item("a"), item("b")],
      new Set(["a"]),
      new Map([["b", "set_aside" as Disposition]]),
    );
    expect(r.item).toBeNull();
    expect(r.showingDeferred).toBe(false);
  });
});
