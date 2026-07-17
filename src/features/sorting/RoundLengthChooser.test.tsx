// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setRoundBox } from "@/lib/round-preference";
import { RoundLengthChooser } from "./RoundLengthChooser";

// setRoundBox is spied to prove the choice persists; getRoundBox stays REAL.
// RoundLengthChooser's option list is inlined (no longer exported from
// round-preference), so it's asserted by literal label here — this file is
// deleted in Task 6 along with the component.
vi.mock("@/lib/round-preference", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/round-preference")>();
  return { ...actual, setRoundBox: vi.fn() };
});

const OPTION_LABELS = ["30 seconds", "1 minute", "2 minutes", "5 minutes", "No timer"];

beforeEach(() => vi.clearAllMocks());

describe("RoundLengthChooser", () => {
  it("renders every option, with 'No timer' a visible peer", () => {
    render(<RoundLengthChooser onChange={vi.fn()} />);
    for (const label of OPTION_LABELS) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
    // "No timer" is a first-class peer in the same list, not hidden behind a toggle.
    expect(screen.getByRole("option", { name: "No timer" })).toBeVisible();
  });

  it("exposes the accessible name 'Round length' on a ≥44px target", () => {
    render(<RoundLengthChooser onChange={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Round length" });
    expect(select).toHaveClass("h-11");
  });

  it("a change persists via setRoundBox AND fires onChange with the box value (numeric and 'none')", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RoundLengthChooser onChange={onChange} />);
    const select = screen.getByRole("combobox", { name: "Round length" });

    await user.selectOptions(select, "60");
    expect(setRoundBox).toHaveBeenCalledWith(60);
    expect(onChange).toHaveBeenCalledWith(60);

    await user.selectOptions(select, "none");
    expect(setRoundBox).toHaveBeenCalledWith("none");
    expect(onChange).toHaveBeenCalledWith("none");
  });
});
