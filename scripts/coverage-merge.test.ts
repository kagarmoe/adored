import { describe, it, expect } from "vitest";
import { mergeCoverageData } from "./coverage-merge";

// Minimal istanbul fileCoverage for a 3-statement file; `s` = per-statement hit counts.
const fileCov = (s: Record<number, number>) => ({
  path: "/x.ts",
  statementMap: {
    0: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
    1: { start: { line: 2, column: 0 }, end: { line: 2, column: 1 } },
    2: { start: { line: 3, column: 0 }, end: { line: 3, column: 1 } },
  },
  fnMap: {}, branchMap: {}, s, f: {}, b: {},
});

describe("mergeCoverageData", () => {
  it("unions hit counts across tiers — a line covered in EITHER tier counts", () => {
    const tierA = { "/x.ts": fileCov({ 0: 1, 1: 0, 2: 0 }) }; // line 1 only
    const tierB = { "/x.ts": fileCov({ 0: 0, 1: 1, 2: 1 }) }; // lines 2,3
    const merged = mergeCoverageData([tierA as any, tierB as any]);
    expect(merged.lines.covered).toBe(3); // union of both tiers
    expect(merged.lines.total).toBe(3);
    expect(merged.lines.pct).toBe(100);
  });

  it("does NOT sum/inflate when the same file runs in both tiers", () => {
    const same = { "/x.ts": fileCov({ 0: 1, 1: 1, 2: 0 }) }; // 2 of 3
    const merged = mergeCoverageData([same as any, same as any]);
    expect(merged.lines.covered).toBe(2); // union, not 4
    expect(merged.lines.total).toBe(3);
  });
});
