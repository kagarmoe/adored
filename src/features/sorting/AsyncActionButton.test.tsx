// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";

import { AsyncActionButton } from "./AsyncActionButton";

describe("AsyncActionButton", () => {
  it("runs the action once on tap and shows the label", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    render(<AsyncActionButton label="Do it" action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Do it" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });

  it("ignores a rapid double-tap — the action fires once (in-flight guard)", async () => {
    // Hold the action unresolved so the second click lands before busy renders.
    let resolve!: () => void;
    const action = vi.fn().mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    render(<AsyncActionButton label="Do it" action={action} />);
    const btn = screen.getByRole("button", { name: "Do it" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    resolve();
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  });

  it("shows the busy label while the action is in flight", async () => {
    const action = vi.fn().mockReturnValue(new Promise<void>(() => {}));
    render(<AsyncActionButton label="Do it" busyLabel="Working…" action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Do it" }));
    await waitFor(() => expect(screen.getByText("Working…")).toBeInTheDocument());
  });

  it("defaults the busy label to 'Just a moment…'", async () => {
    const action = vi.fn().mockReturnValue(new Promise<void>(() => {}));
    render(<AsyncActionButton label="Do it" action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Do it" }));
    await waitFor(() => expect(screen.getByText("Just a moment…")).toBeInTheDocument());
  });

  it("on a thrown action shows the gentle role=status notice and re-enables the button", async () => {
    const action = vi.fn().mockRejectedValue(new Error("boom"));
    render(<AsyncActionButton label="Do it" action={action} />);
    const btn = screen.getByRole("button", { name: "Do it" });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/give it another try/i),
    );
    expect(btn).not.toBeDisabled(); // busy rolled back so a retry is possible
  });
});
