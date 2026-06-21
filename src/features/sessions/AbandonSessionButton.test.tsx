// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AbandonSessionButton } from "./AbandonSessionButton";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("AbandonSessionButton", () => {
  it("a single click only reveals the confirm — it does NOT touch the API", () => {
    render(<AbandonSessionButton sessionId="sess_1" />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/set this session aside\?/i)).toBeInTheDocument();
  });

  it("moves focus to the safe default (Never mind) when the confirm appears", () => {
    render(<AbandonSessionButton sessionId="sess_1" />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    expect(screen.getByRole("button", { name: /never mind/i })).toHaveFocus();
  });

  it("DELETEs the session and refreshes the view on confirm", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<AbandonSessionButton sessionId="sess_1" />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i })); // reveal
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i })); // confirm
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/sessions/sess_1", { method: "DELETE" }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("ignores a rapid double-confirm — only one DELETE is sent", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<AbandonSessionButton sessionId="sess_1" />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i })); // reveal
    const confirm = screen.getByRole("button", { name: /^set aside$/i });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it("backing out keeps the session — no API call, confirm dismissed", () => {
    render(<AbandonSessionButton sessionId="sess_1" />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    fireEvent.click(screen.getByRole("button", { name: /never mind/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/set this session aside\?/i)).not.toBeInTheDocument();
  });

  it("a non-ok response shows a gentle message and does NOT refresh", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<AbandonSessionButton sessionId="sess_1" />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a network rejection (fetch throws) is caught — gentle message, no refresh", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    render(<AbandonSessionButton sessionId="sess_1" />);
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });
});
