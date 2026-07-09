// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ROUND_BOX_OPTIONS, setRoundBox } from "@/lib/round-preference";
import { RoundLengthChooser } from "./RoundLengthChooser";

// setRoundBox is spied to prove the choice persists; ROUND_BOX_OPTIONS and
// getRoundBox stay REAL so the options list is asserted by constant identity,
// never by re-pinned label strings.
vi.mock("@/lib/round-preference", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/round-preference")>();
  return { ...actual, setRoundBox: vi.fn() };
});

beforeEach(() => vi.clearAllMocks());

describe("RoundLengthChooser", () => {
  it("renders every ROUND_BOX_OPTIONS entry (constant identity), with 'No timer' a visible peer", () => {
    render(<RoundLengthChooser onChange={vi.fn()} />);
    for (const opt of ROUND_BOX_OPTIONS) {
      expect(screen.getByRole("option", { name: opt.label })).toBeInTheDocument();
    }
    // "No timer" is a first-class peer in the same list, not hidden behind a toggle.
    expect(ROUND_BOX_OPTIONS.some((o) => o.value === "none")).toBe(true);
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

    await user.selectOptions(select, "1");
    expect(setRoundBox).toHaveBeenCalledWith(1);
    expect(onChange).toHaveBeenCalledWith(1);

    await user.selectOptions(select, "none");
    expect(setRoundBox).toHaveBeenCalledWith("none");
    expect(onChange).toHaveBeenCalledWith("none");
  });
});
