import { describe, expect, it } from "vitest";
import { badgeVariants } from "./Badge";

describe("Badge tier variants", () => {
  it("maps the four tiers to the cool value-ramp tokens", () => {
    expect(badgeVariants({ variant: "top" })).toContain("bg-tier-love");
    expect(badgeVariants({ variant: "high" })).toContain("bg-tier-like");
    expect(badgeVariants({ variant: "medium" })).toContain("bg-tier-maybe");
    expect(badgeVariants({ variant: "low" })).toContain("bg-tier-onward");
  });

  it("pairs each tier with its own AA-locked ink", () => {
    expect(badgeVariants({ variant: "top" })).toContain("text-tier-love-ink");
    expect(badgeVariants({ variant: "low" })).toContain("text-tier-onward-ink");
  });

  it("no longer references the retired warm tokens", () => {
    const all = (["top", "high", "medium", "low"] as const)
      .map((v) => badgeVariants({ variant: v }))
      .join(" ");
    expect(all).not.toMatch(/gold|espresso|vellum/);
  });
});

describe("Badge status variants", () => {
  // DESIGN.md: brand never speaks Danger — pause is a calm, reversible, non-error
  // state, so its badge must use the cool-blue benign token, never the amber
  // safety palette. Locks the wb3 re-map against regression.
  it("paused uses the calm cool-blue benign token (+ ink), not the warning safety palette", () => {
    const paused = badgeVariants({ variant: "paused" });
    expect(paused).toContain("bg-accent-sky");
    expect(paused).toContain("text-ink");
    expect(paused).not.toMatch(/warning/);
  });
});
