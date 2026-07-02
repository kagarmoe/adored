// @vitest-environment node
import { describe, expect, it } from "vitest";
import { shouldShowWelcome } from "./gate";
import { isWelcomeDismissed } from "./dismissal";

describe("shouldShowWelcome (first-run gate decision)", () => {
  it("shows the walkthrough for zero collections + not dismissed", () => {
    expect(shouldShowWelcome(0, false)).toBe(true);
  });

  it("does not show when dismissed, even with zero collections", () => {
    expect(shouldShowWelcome(0, true)).toBe(false);
  });

  it("does not show when the user already has collections", () => {
    expect(shouldShowWelcome(3, false)).toBe(false);
    expect(shouldShowWelcome(3, true)).toBe(false);
  });
});

describe("dismissal helper is SSR-safe", () => {
  it("returns not-dismissed on the server (no document, no throw)", () => {
    expect(typeof document).toBe("undefined");
    expect(isWelcomeDismissed()).toBe(false);
  });
});
