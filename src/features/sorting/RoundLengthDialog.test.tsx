// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoundLengthDialog } from "./RoundLengthDialog";

// jsdom does not implement the Pointer Capture API — TimerDial's onPointerDown
// calls it, so it's stubbed for every dialog test that mounts the dial.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    value: vi.fn(),
    writable: true,
  });
});

describe("RoundLengthDialog", () => {
  it("previews without committing; Done commits once; Esc cancels", () => {
    const onCommit = vi.fn();
    const onClose = vi.fn();
    render(<RoundLengthDialog open initial={120} onCommit={onCommit} onClose={onClose} />);
    const slider = screen.getByRole("slider");
    fireEvent.keyDown(slider, { key: "ArrowDown" }); // preview 90
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(90);
  });

  it("Esc closes without committing", () => {
    const onCommit = vi.fn();
    const onClose = vi.fn();
    render(<RoundLengthDialog open initial={120} onCommit={onCommit} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("focuses the slider on open", () => {
    render(<RoundLengthDialog open initial={120} onCommit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("slider")).toHaveFocus();
  });

  it("is not rendered when closed", () => {
    render(<RoundLengthDialog open={false} initial={120} onCommit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("re-seeds the draft to `initial` each time it opens", () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <RoundLengthDialog open={false} initial={120} onCommit={onCommit} onClose={vi.fn()} />,
    );
    rerender(<RoundLengthDialog open initial={90} onCommit={onCommit} onClose={vi.fn()} />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "90");
  });
});
