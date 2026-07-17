// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { useRef, useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoundLengthDialog } from "./RoundLengthDialog";
import type { RoundBoxSeconds } from "@/lib/round-preference";

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

  // A harness standing in for a host: a real trigger button + open/close state,
  // wired the way RoundSurface/TriageRound/UsageRound wire it (adjustButtonRef ==
  // returnFocusRef). The dialog is a portal, so it cannot regain the host's
  // trigger's focus on its own (unmounting drops focus to <body>) — the host
  // must hand the element back, and this proves it does.
  function Harness() {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(true);
    return (
      <>
        <button ref={triggerRef} type="button">
          Change round length
        </button>
        <RoundLengthDialog
          open={open}
          initial={120}
          onCommit={vi.fn<(box: RoundBoxSeconds) => void>()}
          onClose={() => setOpen(false)}
          returnFocusRef={triggerRef}
        />
      </>
    );
  }

  it("Esc returns focus to the host's trigger via returnFocusRef", () => {
    render(<Harness />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Change round length" })).toHaveFocus();
  });

  it("Done returns focus to the host's trigger via returnFocusRef", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Change round length" })).toHaveFocus();
  });

  it("the × close button returns focus to the host's trigger via returnFocusRef", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Close round length" }));
    expect(screen.getByRole("button", { name: "Change round length" })).toHaveFocus();
  });
});
