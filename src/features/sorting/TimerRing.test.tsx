// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TimerRing } from "./TimerRing";

describe("TimerRing", () => {
  it("renders the conic sweep with the anti-aliased stop at the fraction", () => {
    const { container } = render(<TimerRing fraction={0.5} size={40} />);
    const ring = container.firstElementChild as HTMLElement;
    expect(ring.style.background).toContain("conic-gradient");
    expect(ring.style.background).toContain("calc(50% - 0.5%)");
    expect(ring.style.width).toBe("40px");
  });

  it("expired: gold band, ✓ visible but decorative", () => {
    render(<TimerRing fraction={0} size={56} expired />);
    const check = screen.getByText("✓");
    expect(check).toHaveAttribute("aria-hidden");
    expect(check.closest("div[class*='bg-spark']")).not.toBeNull();
  });

  it("clamps fraction into 0..1", () => {
    const { container } = render(<TimerRing fraction={1.4} size={40} />);
    expect((container.firstElementChild as HTMLElement).style.background).toContain("calc(100% - 0.5%)");
  });
});
