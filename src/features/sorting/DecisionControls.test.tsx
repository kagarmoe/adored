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
    render(
      <DecisionControls
        submit={{ kind: "session", sessionId: "sess_1" }}
        type="triage"
        decisions={TRIAGE_DECISIONS}
      />,
    );
    for (const label of ["Love", "Like", "Maybe", "Onward"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("tapping a tier POSTs that tier's decision (the right `result`) to the session decisions route", async () => {
    const user = userEvent.setup();
    render(
      <DecisionControls
        submit={{ kind: "session", sessionId: "sess_1" }}
        type="triage"
        decisions={TRIAGE_DECISIONS}
      />,
    );

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
    render(
      <DecisionControls
        submit={{ kind: "session", sessionId: "sess_1" }}
        type="triage"
        decisions={TRIAGE_DECISIONS}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Love" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    );
    expect(body.decision.result).toBe("top");
  });

  it("refreshes the route after a successful save (advances to the next item) when no callback is given", async () => {
    const user = userEvent.setup();
    render(
      <DecisionControls
        submit={{ kind: "session", sessionId: "sess_1" }}
        type="triage"
        decisions={TRIAGE_DECISIONS}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Like" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("re-enables the tiers after a successful save on the refresh path (so the next item is triageable)", async () => {
    // Regression for U2: the success branch called router.refresh() but never
    // reset pendingLabel. Because the triage page reuses this client instance
    // across the soft refresh, every tier stayed disabled forever and a normal
    // user could not triage past the first item.
    const user = userEvent.setup();
    render(
      <DecisionControls
        submit={{ kind: "session", sessionId: "sess_1" }}
        type="triage"
        decisions={TRIAGE_DECISIONS}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Love" }));

    // The save resolved ok and the route refreshed; the controls must return to
    // their resting, enabled state — no button stuck on "Saving...".
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      for (const label of ["Love", "Like", "Maybe", "Onward"]) {
        expect(screen.getByRole("button", { name: label })).toBeEnabled();
      }
    });
    expect(screen.queryByRole("button", { name: "Saving..." })).not.toBeInTheDocument();
  });

  it("announces the saved tier in a live region that already exists before the tap, and re-announces a repeated tier (SC 4.1.3)", async () => {
    // `kind: "local"` on purpose: that is the shape every real page ships
    // (TriageRound/UsageRound/onboarding). An announcement wired only into the
    // session branch would be dead in the app.
    const user = userEvent.setup();
    render(
      <DecisionControls
        submit={{ kind: "local", onDecision: vi.fn() }}
        type="triage"
        decisions={TRIAGE_DECISIONS}
      />,
    );

    // The region must be in the DOM BEFORE its text changes, or screen readers
    // never announce it.
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await user.click(screen.getByRole("button", { name: "Love" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Love — saved."));
    const first = screen.getByRole("status").textContent;

    // Triage runs Love, Love, Love — identical text would not re-fire the live
    // region, so the second save must still mutate it.
    await user.click(screen.getByRole("button", { name: "Love" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).not.toBe(first));
    expect(screen.getByRole("status")).toHaveTextContent("Love — saved.");
  });

  it("calls onDecisionMade instead of router.refresh when a callback is provided", async () => {
    const onDecisionMade = vi.fn();
    const user = userEvent.setup();
    render(
      <DecisionControls
        submit={{ kind: "session", sessionId: "sess_1", onDecisionMade }}
        type="triage"
        decisions={TRIAGE_DECISIONS}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Love" }));

    await waitFor(() => expect(onDecisionMade).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("surfaces a gentle error and re-enables the tiers when the save fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const user = userEvent.setup();
    render(
      <DecisionControls
        submit={{ kind: "session", sessionId: "sess_1" }}
        type="triage"
        decisions={TRIAGE_DECISIONS}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Onward" }));

    expect(await screen.findByText("Failed to save decision")).toBeInTheDocument();
    // Re-enabled so the user can retry — not stuck on "Saving...".
    expect(screen.getByRole("button", { name: "Onward" })).toBeEnabled();
  });
});

describe("prior answer (F19)", () => {
  it("marks the standing tier as currently selected (aria-pressed) and leaves the others untouched", () => {
    render(
      <DecisionControls
        submit={{ kind: "local", onDecision: vi.fn() }}
        type="triage"
        decisions={TRIAGE_DECISIONS}
        priorAnswer="Like"
      />,
    );
    expect(screen.getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "true");
    for (const label of ["Love", "Maybe", "Onward"]) {
      expect(screen.getByRole("button", { name: label })).not.toHaveAttribute("aria-pressed");
    }
  });

  it("without the prop, no tier is pressed — today's fresh rendering (regression)", () => {
    render(
      <DecisionControls
        submit={{ kind: "local", onDecision: vi.fn() }}
        type="triage"
        decisions={TRIAGE_DECISIONS}
      />,
    );
    for (const label of ["Love", "Like", "Maybe", "Onward"]) {
      expect(screen.getByRole("button", { name: label })).not.toHaveAttribute("aria-pressed");
    }
  });

  it("the standing tier stays tappable — a different tap still submits (change-your-mind path)", async () => {
    const onDecision = vi.fn();
    render(
      <DecisionControls
        submit={{ kind: "local", onDecision }}
        type="triage"
        decisions={TRIAGE_DECISIONS}
        priorAnswer="Love"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Maybe" }));
    expect(onDecision).toHaveBeenCalledWith({ itemId: "item_1", result: "medium" });
  });
});

describe("local mode", () => {
  it("calls onDecision synchronously with no fetch, no pending state", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onDecision = vi.fn();
    render(
      <DecisionControls
        submit={{ kind: "local", onDecision }}
        type="triage"
        decisions={[{ label: "Love", decision: { itemId: "i1", result: "top" } }]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Love" }));
    expect(onDecision).toHaveBeenCalledWith({ itemId: "i1", result: "top" });
    expect(fetchSpy).not.toHaveBeenCalled();
    // No soft-lock: the control is immediately re-enabled (no "Saving…").
    expect(screen.getByRole("button", { name: "Love" })).toBeEnabled();
  });

  it("does not refresh the router in local mode (synchronous demo path bypasses it)", async () => {
    const onDecision = vi.fn();
    render(
      <DecisionControls
        submit={{ kind: "local", onDecision }}
        type="triage"
        decisions={[{ label: "Love", decision: { itemId: "i1", result: "top" } }]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Love" }));
    expect(refresh).not.toHaveBeenCalled();
  });
});
