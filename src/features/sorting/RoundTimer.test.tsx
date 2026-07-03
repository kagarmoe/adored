// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { RoundTimer } from "./RoundTimer";

// The reduced-motion hook is mocked per-test; default is "no reduced motion".
let reducedMotion = false;
vi.mock("@/lib/useReducedMotion", () => ({
  useReducedMotion: () => reducedMotion,
}));

describe("RoundTimer", () => {
  beforeEach(() => {
    reducedMotion = false;
    vi.useFakeTimers();
    // A fixed clock so remaining-time math is deterministic.
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("exposes a text alternative (role=timer with the minutes remaining), not colour alone", () => {
    render(
      <RoundTimer startedAtMs={1_000_000} boxMs={7 * 60_000} onExpire={vi.fn()} roundLabel="Round one" />,
    );
    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent(/about 7 minutes left/i);
    expect(timer).toHaveAttribute("aria-live", "polite");
  });

  it("renders a depleting violet bar (bg-decor fill over a bg-content-soft track) while running", () => {
    const { container } = render(
      <RoundTimer startedAtMs={1_000_000} boxMs={10 * 60_000} onExpire={vi.fn()} roundLabel="Round" />,
    );
    expect(container.querySelector(".bg-content-soft")).not.toBeNull();
    const fill = container.querySelector(".bg-decor");
    expect(fill).not.toBeNull();
    // Just started: bar is (nearly) full, not gold.
    expect(container.querySelector(".bg-spark")).toBeNull();
  });

  it("fires onExpire exactly once and settles to the gold end state with a non-colour cue", () => {
    const onExpire = vi.fn();
    const { container } = render(
      <RoundTimer startedAtMs={1_000_000} boxMs={2_000} onExpire={onExpire} roundLabel="Round" />,
    );
    expect(onExpire).not.toHaveBeenCalled();

    // Advance the wall clock and the coarse interval past the 2s box.
    act(() => {
      vi.setSystemTime(1_003_000);
      vi.advanceTimersByTime(3_000);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
    // Non-colour end cue: text + glyph, queryable by text (never colour alone).
    expect(screen.getByText(/round complete/i)).toBeInTheDocument();
    // Gold settle.
    expect(container.querySelector(".bg-spark")).not.toBeNull();

    // Keep ticking: the callback must not fire a second time.
    act(() => {
      vi.setSystemTime(1_010_000);
      vi.advanceTimersByTime(5_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("under reduced motion does NOT animate the bar, but expiry STILL fires", () => {
    reducedMotion = true;
    const onExpire = vi.fn();
    const { container } = render(
      <RoundTimer startedAtMs={1_000_000} boxMs={2_000} onExpire={onExpire} roundLabel="Round" />,
    );

    // No transition/animation class on the fill while reduced motion is on.
    const fill = container.querySelector(".bg-decor");
    expect(fill).not.toBeNull();
    expect(fill!.className).not.toMatch(/transition|animate/);

    // The subtle correctness test: suppressing animation must NOT suppress termination.
    act(() => {
      vi.setSystemTime(1_003_000);
      vi.advanceTimersByTime(3_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/round complete/i)).toBeInTheDocument();
  });

  it("with no timer (boxMs=null) renders the label, NO bar/countdown, and never calls onExpire", () => {
    const onExpire = vi.fn();
    const { container } = render(
      <RoundTimer startedAtMs={1_000_000} boxMs={null} onExpire={onExpire} roundLabel="Round one" />,
    );

    expect(screen.getByText("Round one")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).toBeNull();
    expect(container.querySelector(".bg-decor")).toBeNull();
    expect(screen.queryByText(/left/i)).toBeNull();

    act(() => {
      vi.setSystemTime(1_060_000);
      vi.advanceTimersByTime(60_000);
    });
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("rounds the remaining-minutes label up so a partly-elapsed round never reads 0 while running", () => {
    // 90s box, 0 elapsed -> "about 2 minutes left" (ceil).
    render(
      <RoundTimer startedAtMs={1_000_000} boxMs={90_000} onExpire={vi.fn()} roundLabel="Round" />,
    );
    expect(screen.getByRole("timer")).toHaveTextContent(/about 2 minutes left/i);
  });
});
