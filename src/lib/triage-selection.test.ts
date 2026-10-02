import { describe, it, expect } from "vitest";
import { selectTriageQueue } from "./triage-selection";
import type { Item, Disposition } from "@/types";

const item = (id: string): Item => ({ id, collectionId: "c", name: id, brand: null, style: null, color: null, material: null, category: null, number: null, height: null, width: null, depth: null, weight: null, unit: "imperial", status: null, notes: null, createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null });

describe("selectTriageQueue", () => {
  it("returns the whole eligible remainder: active first, then deferred, with per-entry flags", () => {
    const disp = new Map<string, Disposition>([["b", "deferred"]]);
    const q = selectTriageQueue([item("a"), item("b"), item("c")], new Set(), disp);
    expect(q.map((e) => e.item.id)).toEqual(["a", "c", "b"]);
    expect(q.map((e) => e.deferred)).toEqual([false, false, true]);
  });

  it("excludes triaged (in preferenceItemIds) and set_aside items; deferred still included at the tail", () => {
    const disp = new Map<string, Disposition>([
      ["b", "set_aside"],
      ["c", "deferred"],
    ]);
    const q = selectTriageQueue([item("a"), item("b"), item("c"), item("d")], new Set(["a"]), disp);
    expect(q.map((e) => e.item.id)).toEqual(["d", "c"]);
    expect(q.map((e) => e.deferred)).toEqual([false, true]);
  });

  it("preserves input order within the active run and within the deferred tail", () => {
    const disp = new Map<string, Disposition>([
      ["x", "deferred"],
      ["y", "deferred"],
    ]);
    const q = selectTriageQueue([item("y"), item("c"), item("x"), item("a")], new Set(), disp);
    expect(q.map((e) => e.item.id)).toEqual(["c", "a", "y", "x"]);
  });

  it("returns [] for empty input", () => {
    expect(selectTriageQueue([], new Set(), new Map())).toEqual([]);
  });

  it("returns [] when everything is triaged or set aside", () => {
    const disp = new Map<string, Disposition>([["b", "set_aside"]]);
    expect(selectTriageQueue([item("a"), item("b")], new Set(["a"]), disp)).toEqual([]);
  });
});
