import { describe, it, expect } from "vitest";
import { clampLimit } from "./AuditLogRepository";

// Pins the cap CONSTANTS (default 100, hard cap 200, floor 1) — the DB
// integration tests only prove the read is bounded, not that the ceiling is
// exactly 200, so a wrong constant (e.g. 2000) would slip past them.
describe("clampLimit (audit read ?limit= guard)", () => {
  it("caps anything above the max at 200", () => {
    expect(clampLimit(201)).toBe(200);
    expect(clampLimit(99999)).toBe(200);
  });

  it("floors anything below 1 at 1", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
  });

  it("defaults NaN / absent to 100", () => {
    expect(clampLimit(NaN)).toBe(100);
    expect(clampLimit(undefined)).toBe(100);
  });

  it("passes an in-range value through, truncating fractions", () => {
    expect(clampLimit(50)).toBe(50);
    expect(clampLimit(50.9)).toBe(50);
  });

  it("treats the exact boundaries as in-range", () => {
    expect(clampLimit(1)).toBe(1);
    expect(clampLimit(200)).toBe(200);
  });
});
