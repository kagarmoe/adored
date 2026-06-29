import { describe, expect, it } from "vitest";
import { buttonVariants } from "./Button";

describe("Button secondary variant", () => {
  // Deletion tripwire (not a cascade proof — the screenshot proves the override).
  // In dark, the secondary fill (content-soft) ≈ the surface/panel it sits on
  // (~1.1:1), so the button would dissolve. A light ink-soft rim defines it at
  // ≥3:1 (WCAG 1.4.11). Light theme is unbordered (dark: only).
  it("carries a dark-only ink-soft rim so it clears 1.4.11 on dark surfaces", () => {
    const secondary = buttonVariants({ variant: "secondary" });
    expect(secondary).toContain("dark:border");
    expect(secondary).toContain("dark:border-ink-soft");
  });

  it("does not border the secondary button in light theme", () => {
    // No bare `border` utility — the rim is gated behind the dark: variant only.
    const secondary = buttonVariants({ variant: "secondary" });
    expect(secondary).not.toMatch(/(^|\s)border(\s|$)/);
  });
});
