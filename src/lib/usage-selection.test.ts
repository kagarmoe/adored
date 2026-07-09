import { describe, it, expect } from "vitest";
import { selectUsageQueue } from "./usage-selection";
import type { UsageAnswer } from "@/lib/derive-usage";
import type { Item, Disposition } from "@/types";

const item = (id: string): Item => ({ id, collectionId: "c", name: id, brand: null, style: null, color: null, material: null, category: null, number: null, height: null, width: null, depth: null, weight: null, unit: "imperial", status: null, notes: null, createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null });

const usage = (pairs: Array<[string, UsageAnswer]>) => new Map<string, UsageAnswer>(pairs);
const disp = (pairs: Array<[string, Disposition]>) => new Map<string, Disposition>(pairs);

describe("selectUsageQueue", () => {
  it("includes untriaged items (usage is a primary sort, no triage prerequisite)", () => {
    const q = selectUsageQueue([item("a"), item("b")], usage([]), disp([]));
    expect(q.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("excludes items whose usage is already known", () => {
    const q = selectUsageQueue([item("a"), item("b")], usage([["a", "uses"]]), disp([]));
    expect(q.map((i) => i.id)).toEqual(["b"]);
  });

  it("excludes 'not_uses' as usage-known too (any answer counts as known)", () => {
    const q = selectUsageQueue([item("a"), item("b")], usage([["a", "not_uses"]]), disp([]));
    expect(q.map((i) => i.id)).toEqual(["b"]);
  });

  it("excludes set_aside items", () => {
    const q = selectUsageQueue([item("a"), item("b")], usage([]), disp([["a", "set_aside"]]));
    expect(q.map((i) => i.id)).toEqual(["b"]);
  });

  it("excludes deferred items too (the deliberate fork: honored by absence, no banner)", () => {
    const q = selectUsageQueue([item("a"), item("b")], usage([]), disp([["a", "deferred"]]));
    expect(q.map((i) => i.id)).toEqual(["b"]);
  });

  it("preserves input order", () => {
    const q = selectUsageQueue([item("c"), item("a"), item("b")], usage([]), disp([]));
    expect(q.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("returns [] for empty input", () => {
    expect(selectUsageQueue([], usage([]), disp([]))).toEqual([]);
  });

  it("returns bare Items with no deferred flag or banner shape", () => {
    const q = selectUsageQueue([item("a")], usage([]), disp([]));
    expect(q[0]).toEqual(item("a"));
    expect(q[0]).not.toHaveProperty("deferred");
  });

  it("handles a mixed set: usage-known + set_aside + deferred + eligible", () => {
    // a: usage-known, b: set_aside, c: deferred, d: eligible → only d
    const q = selectUsageQueue(
      [item("a"), item("b"), item("c"), item("d")],
      usage([["a", "uses"]]),
      disp([
        ["b", "set_aside"],
        ["c", "deferred"],
      ]),
    );
    expect(q.map((i) => i.id)).toEqual(["d"]);
  });
});
