import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPARE_SUBLINE,
  ROUND_COPY,
  triageDecisions,
  usageDecisions,
  USAGE_PASS_ARIA_LABEL,
  USAGE_PASS_LABEL,
  USAGE_PASS_TITLE,
} from "./roundCopy";

describe("roundCopy", () => {
  it("names both rounds with person-side arc names + explainers", () => {
    expect(ROUND_COPY.triage.name).toBe("Get acquainted");
    expect(ROUND_COPY.compare.name).toBe("Which do you love more?");
    // TONE litmus: no inventory verbs, no pace words (spec: rewritten person-side).
    for (const round of Object.values(ROUND_COPY)) {
      expect(round.explainer.toLowerCase()).not.toMatch(/bucket|quickly|refine ranking/);
    }
  });

  it("carries the usage round copy verbatim", () => {
    expect(ROUND_COPY.usage.name).toBe("Do you use this?");
    expect(ROUND_COPY.usage.explainer).toBe(
      "One piece at a time — is it in your life these days?",
    );
  });

  it("builds the four tier decisions for an item", () => {
    expect(triageDecisions("item-1")).toEqual([
      { label: "Love", decision: { itemId: "item-1", result: "top" } },
      { label: "Like", decision: { itemId: "item-1", result: "high" } },
      { label: "Maybe", decision: { itemId: "item-1", result: "medium" } },
      { label: "Onward", decision: { itemId: "item-1", result: "low" } },
    ]);
  });

  it("builds the two usage decisions for an item", () => {
    expect(usageDecisions("item-1")).toEqual([
      { label: "Yes, I use it", decision: { itemId: "item-1", result: "uses" } },
      { label: "Not these days", decision: { itemId: "item-1", result: "not_uses" } },
    ]);
  });

  it("carries the usage pass-button copy verbatim", () => {
    expect(USAGE_PASS_LABEL).toBe("Skip for now");
    expect(USAGE_PASS_TITLE).toBe("It'll come around again");
    expect(USAGE_PASS_ARIA_LABEL).toBe("Skip for now — it'll come around again");
    // WCAG 2.5.3: the accessible name begins with the visible label.
    expect(USAGE_PASS_ARIA_LABEL.startsWith(USAGE_PASS_LABEL)).toBe(true);
  });

  it("keeps the usage-round copy free of digits, denominators, and urgency", () => {
    const usageStrings = [
      ROUND_COPY.usage.name,
      ROUND_COPY.usage.explainer,
      USAGE_PASS_LABEL,
      USAGE_PASS_TITLE,
      USAGE_PASS_ARIA_LABEL,
      ...usageDecisions("item-1").map((d) => d.label),
    ];
    for (const s of usageStrings) {
      expect(s).not.toMatch(/\d/); // no digits
      expect(s.toLowerCase()).not.toMatch(/\bof\b|\bout of\b|\/|%/); // no denominators
      expect(s.toLowerCase()).not.toMatch(
        /\bhurry\b|\btoday only\b|\blast chance\b|\bmust\b|\bdon't miss\b|\bexpires?\b/,
      ); // no urgency
    }
  });

  it("carries the compare sub-line", () => {
    expect(COMPARE_SUBLINE).toBe("Tap the one you love more. Tie or skip whenever you like.");
  });

  it("stays server-importable (no 'use client')", () => {
    const src = readFileSync(new URL("./roundCopy.ts", import.meta.url), "utf8");
    expect(src).not.toContain("use client");
  });
});
