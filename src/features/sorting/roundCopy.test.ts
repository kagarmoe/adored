import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROUND_COPY, triageDecisions } from "./roundCopy";

describe("roundCopy", () => {
  it("explains both phases person-side", () => {
    // TONE litmus: no inventory verbs, no pace words (spec: rewritten person-side).
    for (const round of Object.values(ROUND_COPY)) {
      expect(round.explainer.toLowerCase()).not.toMatch(/bucket|quickly|refine ranking/);
    }
  });

  it("builds the four tier decisions for an item", () => {
    expect(triageDecisions("item-1")).toEqual([
      { label: "Love", decision: { itemId: "item-1", result: "top" } },
      { label: "Like", decision: { itemId: "item-1", result: "high" } },
      { label: "Maybe", decision: { itemId: "item-1", result: "medium" } },
      { label: "Onward", decision: { itemId: "item-1", result: "low" } },
    ]);
  });

  it("stays server-importable (no 'use client')", () => {
    const src = readFileSync(new URL("./roundCopy.ts", import.meta.url), "utf8");
    expect(src).not.toContain("use client");
  });
});
