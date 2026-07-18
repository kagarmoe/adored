// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

// The set-aside DELETE pre-flushes through the shared engine — mock it idle so
// the existing DELETE/restore assertions are untouched by queue state.
vi.mock("@/features/sorting/decisionFlusher", () => ({
  drain: vi.fn().mockResolvedValue(undefined),
  triggerFlush: vi.fn().mockResolvedValue(undefined),
}));

import { ActiveSessionPanel } from "./ActiveSessionPanel";
import { triggerFlush } from "@/features/sorting/decisionFlusher";

const session = { id: "sess_1", number: 3, goal: "Find my favorites", status: "active" as const };
const pausedSession = { ...session, status: "paused" as const };
const resumeHref = "/collections/my-bags/sort/3";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("ActiveSessionPanel", () => {
  it("renders the session card with goal and a Resume link when an active session is present", () => {
    render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    expect(screen.getByRole("heading", { name: "Keep sorting" })).toBeInTheDocument();
    expect(screen.getByText(/find my favorites/i)).toBeInTheDocument();
    // Governed label (spec §9): the resume affordance reads "Resume sorting".
    const resume = screen.getByRole("link", { name: "Resume sorting" });
    expect(resume).toHaveAttribute("href", resumeHref);
  });

  it("for an active session, Resume is a link and issues no PATCH", () => {
    render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    const resume = screen.getByRole("link", { name: "Resume sorting" });
    expect(resume).toHaveAttribute("href", resumeHref);
    fireEvent.click(resume);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("for a paused session, renders the person-side paused copy", () => {
    render(<ActiveSessionPanel curatorId="u1" session={pausedSession} resumeHref={resumeHref} />);
    expect(screen.getByText(/your sort is paused/i)).toBeInTheDocument();
    expect(
      screen.getByText(/your sort is safe — pick up where you left off\./i),
    ).toBeInTheDocument();
    // The active heading must NOT appear for a paused session.
    expect(screen.queryByRole("heading", { name: "Keep sorting" })).not.toBeInTheDocument();
  });

  it("lifts the panel by light in dark (surface-raised + glow), not a muddy tint", () => {
    // DOM-node tripwire: the dark elevation classes must land on the real panel
    // node. This proves attachment, NOT that the cascade override wins — the dark
    // screenshot is the proof of that (see the spec's Risks section).
    const { container } = render(
      <ActiveSessionPanel curatorId="u1" session={pausedSession} resumeHref={resumeHref} />,
    );
    const panel = container.querySelector('[class*="dark:bg-surface-raised"]');
    expect(panel).not.toBeNull();
    expect(panel?.className).toContain("dark:shadow-raised");
    // Light keeps the soft tint untouched.
    expect(panel?.className).toContain("bg-content-soft");
  });

  it("disables Set aside while a paused Resume PATCH is in flight (no concurrent set-aside)", async () => {
    let resolve!: (v: unknown) => void;
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    ); // the resume PATCH hangs
    render(<ActiveSessionPanel curatorId="u1" session={pausedSession} resumeHref={resumeHref} />);
    expect(screen.getByRole("button", { name: /^set aside$/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Resume sorting" }));
    // While the PATCH is in flight, the sibling Set aside is disabled so the two
    // can't race on the same row.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^set aside$/i })).toBeDisabled(),
    );
    resolve({ ok: true });
  });

  it("for a paused session, Resume PATCHes status:active then navigates (ResumeControl, not a bare link)", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ActiveSessionPanel curatorId="u1" session={pausedSession} resumeHref={resumeHref} />);
    // ResumeControl renders a <button>, not an <a> — there is no Resume link.
    // Governed label (spec §9): the paused affordance also reads "Resume sorting".
    expect(screen.queryByRole("link", { name: "Resume sorting" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume sorting" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/sessions/sess_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith(resumeHref));
  });

  it("set aside / undo works the same for a paused session", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ActiveSessionPanel curatorId="u1" session={pausedSession} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i })); // reveal
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i })); // confirm
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/sessions/sess_1", { method: "DELETE" }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("owns the Continue heading — present with a session, gone without one (no bare heading)", () => {
    const { container, rerender } = render(
      <ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />,
    );
    expect(screen.getByRole("heading", { name: "Continue" })).toBeInTheDocument();
    rerender(<ActiveSessionPanel curatorId="u1" session={null} resumeHref={resumeHref} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing visible when there is no session and no undo", () => {
    const { container } = render(<ActiveSessionPanel curatorId="u1" session={null} resumeHref={resumeHref} />);
    expect(screen.queryByText(/active/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("no session + startHref (never sorted): the start card with wireframe copy, primary link", () => {
    render(
      <ActiveSessionPanel
        curatorId="u1"
        session={null}
        resumeHref={resumeHref}
        startHref="/collections/c/sort/new"
        hasEverSorted={false}
      />,
    );
    expect(screen.getByRole("heading", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Start sorting" })).toBeInTheDocument();
    expect(screen.getByText("Begin with how you feel about each.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start sorting" })).toHaveAttribute(
      "href",
      "/collections/c/sort/new",
    );
  });

  it("no session + startHref (sorted before): progress-aware copy", () => {
    render(
      <ActiveSessionPanel curatorId="u1" session={null} resumeHref={resumeHref} startHref="/s" hasEverSorted />,
    );
    expect(screen.getByRole("heading", { name: "Keep sorting" })).toBeInTheDocument();
    expect(
      screen.getByText("Pick up where you left off — one decision at a time."),
    ).toBeInTheDocument();
  });

  it("startHref absent and no session: still renders NOTHING (the #351 pin)", () => {
    const { container } = render(<ActiveSessionPanel curatorId="u1" session={null} resumeHref={resumeHref} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("undo takes precedence over the start card", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const { rerender } = render(
      <ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} startHref="/s" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    await screen.findByRole("status");
    rerender(<ActiveSessionPanel curatorId="u1" session={null} resumeHref={resumeHref} startHref="/s" />);
    expect(screen.queryByRole("heading", { name: "Start sorting" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
  });

  it("session card: 'Keep sorting', no badge, fallback line", () => {
    render(
      <ActiveSessionPanel curatorId="u1" session={{ ...session, goal: null }} resumeHref={resumeHref} />,
    );
    expect(screen.getByRole("heading", { name: "Keep sorting" })).toBeInTheDocument();
    expect(screen.queryByText(/^active$/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Pick up where you left off — one decision at a time."),
    ).toBeInTheDocument();
  });

  it("a single tap only reveals the confirm — it does NOT DELETE", () => {
    render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/set this session aside\?/i)).toBeInTheDocument();
  });

  it("moves focus to the safe default (Never mind) when the confirm appears", () => {
    render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    expect(screen.getByRole("button", { name: /never mind/i })).toHaveFocus();
  });

  it("backing out keeps the session — no API call, confirm dismissed", () => {
    render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    fireEvent.click(screen.getByRole("button", { name: /never mind/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/set this session aside\?/i)).not.toBeInTheDocument();
  });

  it("only the confirm's Set aside DELETEs the session and refreshes", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i })); // reveal
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i })); // confirm
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/sessions/sess_1", { method: "DELETE" }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("the set-aside DELETE pre-flushes the session's decision queue first (Epic P Task 16 — resolution #2)", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i })); // reveal
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i })); // confirm
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/sessions/sess_1", { method: "DELETE" }),
    );
    expect(vi.mocked(triggerFlush)).toHaveBeenCalledWith({ curatorId: "u1", sessionId: "sess_1" });
    expect(vi.mocked(triggerFlush).mock.invocationCallOrder[0]).toBeLessThan(
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    );
  });

  it("shows a persistent Undo notice after set-aside that SURVIVES the session prop going null", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const { rerender } = render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i })); // reveal
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i })); // confirm
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent(/set aside/i);
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();

    // The refresh that follows set-aside flips activeSession to null upstream: the
    // parent re-renders the (unconditionally mounted) island with session={null}.
    // The undo state lives in the island, so the notice must STILL be here — this
    // is the whole point (PR2 lesson: undo inside the conditional card vanishes).
    rerender(<ActiveSessionPanel curatorId="u1" session={null} resumeHref={resumeHref} />);
    expect(screen.queryByText(/find my favorites/i)).not.toBeInTheDocument();
    const stillThere = screen.getByRole("status");
    expect(stillThere).toHaveTextContent(/set aside/i);
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
    // The undo notice keeps the Continue section chrome — never a bare notice.
    expect(screen.getByRole("heading", { name: "Continue" })).toBeInTheDocument();
  });

  it("clicking Undo POSTs to the restore route and refreshes, clearing the notice", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const { rerender } = render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    await screen.findByRole("button", { name: /undo/i });
    rerender(<ActiveSessionPanel curatorId="u1" session={null} resumeHref={resumeHref} />);

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/sessions/sess_1/restore", {
        method: "POST",
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2)); // set-aside + undo
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("ignores a rapid double-confirm — only one DELETE is sent", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i })); // reveal
    const confirm = screen.getByRole("button", { name: /^set aside$/i });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("ignores a rapid double-tap on Undo — only one restore POST is sent", async () => {
    let resolve!: (v: unknown) => void;
    (global.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true }) // set-aside DELETE
      .mockReturnValueOnce(new Promise((r) => { resolve = r; })); // restore POST hangs
    const { rerender } = render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    await screen.findByRole("button", { name: /undo/i });
    rerender(<ActiveSessionPanel curatorId="u1" session={null} resumeHref={resumeHref} />);

    const undo = screen.getByRole("button", { name: /undo/i });
    fireEvent.click(undo);
    fireEvent.click(undo);
    resolve({ ok: true });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    // 1 DELETE + 1 POST, not 1 + 2.
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("a failed set-aside shows a gentle role=status message and does NOT refresh", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(/another try/i);
    expect(refresh).not.toHaveBeenCalled();
    // No undo offered when nothing was set aside.
    expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
  });

  it("a network rejection on set-aside is caught — gentle message, no refresh", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a failed Undo shows a gentle message and keeps the undo affordance (no refresh)", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true }) // set-aside ok
      .mockResolvedValueOnce({ ok: false }); // restore fails
    const { rerender } = render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    await screen.findByRole("button", { name: /undo/i });
    rerender(<ActiveSessionPanel curatorId="u1" session={null} resumeHref={resumeHref} />);

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    // The error renders as a SECOND role=status alongside the persistent undo
    // notice, so target the gentle message by its text rather than by role.
    await screen.findByText(/another try/i);
    expect(refresh).toHaveBeenCalledTimes(1); // only the set-aside; undo did not refresh
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
  });

  it("a restore 409 settles into a single 'started a new sort' state — no live Undo, no refresh", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true }) // set-aside DELETE ok
      .mockResolvedValueOnce({ ok: false, status: 409 }); // restore 409 — slot taken
    const { rerender } = render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    await screen.findByRole("button", { name: /undo/i });
    rerender(<ActiveSessionPanel curatorId="u1" session={null} resumeHref={resumeHref} />);

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));

    // Settled: the single gentle "started a new sort" notice renders…
    await screen.findByText(/started a new sort/i);
    // …still inside the Continue section chrome…
    expect(screen.getByRole("heading", { name: "Continue" })).toBeInTheDocument();
    // …with NO live Undo button anymore (fix B — one voice, not undo + error).
    expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
    // The 409 is terminal — there is nothing to refresh to, so refresh stays at 1
    // (only the set-aside), NOT called again after the 409.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("passes the meta prop through to SessionResumeCard's body slot (spec §B workspace meta)", () => {
    render(
      <ActiveSessionPanel
        curatorId="u1"
        session={session}
        resumeHref={resumeHref}
        meta="38 of 100 sorted so far"
      />,
    );
    expect(screen.getByText("38 of 100 sorted so far")).toBeInTheDocument();
  });

  it("omits the meta line when not given", () => {
    render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    expect(screen.queryByText(/sorted so far/)).not.toBeInTheDocument();
  });

  it("renders a decorative middot that is hidden from screen readers in the undo notice", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref={resumeHref} />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    const notice = await screen.findByRole("status");
    const sep = notice.querySelector('[aria-hidden="true"]');
    expect(sep).not.toBeNull();
    expect(sep).toHaveTextContent("·");
  });
});
