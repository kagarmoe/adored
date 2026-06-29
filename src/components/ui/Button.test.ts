import { describe, expect, it } from "vitest";
import { buttonVariants } from "./Button";

describe("Button secondary variant", () => {
  // The content-soft fill ≈ its background in BOTH themes (active-session panel
  // ~1:1, surface ~1.1:1), so the button dissolves. An ink-soft rim defines it at
  // ≥3:1 (WCAG 1.4.11) — light 6.2:1, dark 6.8:1 — in both themes (purses-732j).
  // ink-soft is the secondary-text role colour. Deletion tripwire only; the
  // screenshot is the visual proof.
  it("rims the secondary button in both themes with ink-soft (1.4.11)", () => {
    const secondary = buttonVariants({ variant: "secondary" });
    expect(secondary).toMatch(/(^|\s)border(\s|$)/);
    expect(secondary).toContain("border-ink-soft");
    // Unconditional now — not gated behind the dark: variant.
    expect(secondary).not.toContain("dark:border");
  });
});
