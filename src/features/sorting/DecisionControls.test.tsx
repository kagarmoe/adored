// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DecisionControls } from "./DecisionControls";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

// The triage tiers exactly as the triage page wires them (Love→top … Onward→low).
const TRIAGE_DECISIONS = [
  { label: "Love", decision: { itemId: "item_1", result: "top" } },
  { label: "Like", decision: { itemId: "item_1", result: "high" } },
  { label: "Maybe", decision: { itemId: "item_1", result: "medium" } },
  { label: "Onward", decision: { itemId: "item_1", result: "low" } },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DecisionControls triage tier tap", () => {
  it("renders one button per tier with its human label", () => {
    render(<DecisionControls sessionId="sess_1" type="triage" decisions={TRIAGE_DECISIONS} />);
    for (const label of ["Love", "Like", "Maybe", "Onward"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("tapping a tier POSTs that tier's decision (the right `result`) to the session decisions route", async () => {
    const user = userEvent.setup();
    render(<DecisionControls sessionId="sess_1" type="triage" decisions={TRIAGE_DECISIONS} />);

    await user.click(screen.getByRole("button", { name: "Maybe" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/sessions/sess_1/decisions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      type: "triage",
      decision: { itemId: "item_1", result: "medium" },
    });
  });

  it("a different tier sends a different `result` (Love→top), proving the tap is not hardcoded", async () => {
    const user = userEvent.setup();
    render(<DecisionControls sessionId="sess_1" type="triage" decisions={TRIAGE_DECISIONS} />);

    await user.click(screen.getByRole("button", { name: "Love" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(body.decision.result).toBe("top");
  });

  it("refreshes the route after a successful save (advances to the next item) when no callback is given", async () => {
    const user = userEvent.setup();
    render(<DecisionControls sessionId="sess_1" type="triage" decisions={TRIAGE_DECISIONS} />);

    await user.click(screen.getByRole("button", { name: "Like" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("calls onDecisionMade instead of router.refresh when a callback is provided", async () => {
    const onDecisionMade = vi.fn();
    const user = userEvent.setup();
    render(
      <DecisionControls
        sessionId="sess_1"
        type="triage"
        decisions={TRIAGE_DECISIONS}
        onDecisionMade={onDecisionMade}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Love" }));

    await waitFor(() => expect(onDecisionMade).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("surfaces a gentle error and re-enables the tiers when the save fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const user = userEvent.setup();
    render(<DecisionControls sessionId="sess_1" type="triage" decisions={TRIAGE_DECISIONS} />);

    await user.click(screen.getByRole("button", { name: "Onward" }));

    expect(await screen.findByText("Failed to save decision")).toBeInTheDocument();
    // Re-enabled so the user can retry — not stuck on "Saving...".
    expect(screen.getByRole("button", { name: "Onward" })).toBeEnabled();
  });
});
