// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { RoundTimer, SUB_MINUTE_LABEL } from "./RoundTimer";

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

  it("shows the sub-minute label (not a minute claim) when a 30s box has under a minute left", () => {
    // A 30s box has < 60s remaining for its whole life: it must never claim a minute.
    render(
      <RoundTimer startedAtMs={1_000_000} boxMs={30_000} onExpire={vi.fn()} roundLabel="Round" />,
    );
    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent(SUB_MINUTE_LABEL);
    expect(timer).not.toHaveTextContent(/about 1 minute/i);
  });

  it("shows the sub-minute label once a longer round crosses under 60s remaining", () => {
    render(
      <RoundTimer startedAtMs={1_000_000} boxMs={90_000} onExpire={vi.fn()} roundLabel="Round" />,
    );
    // 90s box: at start reads "about 2 minutes"; after 40s, 50s remain -> sub-minute.
    expect(screen.getByRole("timer")).toHaveTextContent(/about 2 minutes left/i);
    act(() => {
      vi.setSystemTime(1_040_000);
      vi.advanceTimersByTime(40_000);
    });
    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent(SUB_MINUTE_LABEL);
    expect(timer).not.toHaveTextContent(/about 1 minute/i);
  });

  it("crosses to the sub-minute label exactly at the 60000ms boundary — < 60_000, not <= (T9)", () => {
    // Pins RoundTimer's `remaining < 60_000` off-by-one. Ticks land on whole seconds,
    // so two boxes land the observed remaining exactly on each side of the boundary:
    // a 120000ms box at 60s elapsed reads 60000ms; a 119999ms box reads 59999ms.

    // Exactly 60000ms remaining → still the honest minute form.
    const atBoundary = render(
      <RoundTimer startedAtMs={1_000_000} boxMs={120_000} onExpire={vi.fn()} roundLabel="Round" />,
    );
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    const boundaryTimer = atBoundary.getByRole("timer");
    expect(boundaryTimer).toHaveTextContent(/about 1 minute left/i);
    expect(boundaryTimer).not.toHaveTextContent(SUB_MINUTE_LABEL);
    atBoundary.unmount();

    // One millisecond less (59999ms remaining) → the sub-minute label.
    vi.setSystemTime(1_000_000);
    const belowBoundary = render(
      <RoundTimer startedAtMs={1_000_000} boxMs={119_999} onExpire={vi.fn()} roundLabel="Round" />,
    );
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    const belowTimer = belowBoundary.getByRole("timer");
    expect(belowTimer).toHaveTextContent(SUB_MINUTE_LABEL);
    expect(belowTimer).not.toHaveTextContent(/about 1 minute/i);
  });

  it("pins the sub-minute label verbatim (TONE item)", () => {
    expect(SUB_MINUTE_LABEL).toBe("Less than a minute left in this round");
  });
});
