// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimerDial } from "./TimerDial";

// jsdom does not implement the Pointer Capture API — stub it so onPointerDown's
// setPointerCapture call doesn't throw.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    value: vi.fn(),
    writable: true,
  });
});

describe("TimerDial", () => {
  it("slider semantics: arrows step 30s, Home=none, End=5min, valuetext=feel label", () => {
    const onChange = vi.fn();
    render(<TimerDial value={120} onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: /round length/i });
    expect(slider).toHaveAttribute("aria-valuenow", "120");
    expect(slider).toHaveAttribute("aria-valuetext", "2 minutes — a handful");
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith(90);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("none");
    fireEvent.keyDown(slider, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(300);
  });

  it("below 30s the label reads no clock at all — the non-hue empty-vs-30s discriminator", () => {
    render(<TimerDial value="none" onChange={vi.fn()} />);
    expect(screen.getByText("no clock at all")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
  });

  it("teaches itself: the drag-or-tap hint is always rendered", () => {
    render(<TimerDial value={120} onChange={vi.fn()} />);
    expect(screen.getByText("Drag or tap to set.")).toBeInTheDocument();
  });

  it("tap on the dial maps pointer position to a step", () => {
    const onChange = vi.fn();
    render(<TimerDial value={120} onChange={onChange} />);
    const surface = screen.getByRole("slider");
    surface.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerDown(surface, { clientX: 200, clientY: 100 }); // 3 o'clock = 90° → round(90/36)=3 → 90s
    expect(onChange).toHaveBeenLastCalledWith(90);
  });

  it("pointercancel ends the drag — a later pointermove (without a new pointerdown) is inert", () => {
    const onChange = vi.fn();
    render(<TimerDial value={120} onChange={onChange} />);
    const surface = screen.getByRole("slider");
    surface.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    fireEvent.pointerDown(surface, { clientX: 200, clientY: 100 }); // 90s
    expect(onChange).toHaveBeenLastCalledWith(90);

    fireEvent.pointerCancel(surface);
    onChange.mockClear();
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 200 }); // would be 180° → 150s if still dragging
    expect(onChange).not.toHaveBeenCalled();
  });
});
