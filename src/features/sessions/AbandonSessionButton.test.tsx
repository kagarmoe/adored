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
    fireEvent.click(screen.getByRole("button", { name: /^abandon$/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/abandon this session/i)).toBeInTheDocument();
  });

  it("DELETEs the session and refreshes the view on confirm", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<AbandonSessionButton sessionId="sess_1" />);
    fireEvent.click(screen.getByRole("button", { name: /^abandon$/i })); // reveal
    fireEvent.click(screen.getByRole("button", { name: /^abandon$/i })); // confirm
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/sessions/sess_1", { method: "DELETE" }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("backing out keeps the session — no API call, confirm dismissed", () => {
    render(<AbandonSessionButton sessionId="sess_1" />);
    fireEvent.click(screen.getByRole("button", { name: /^abandon$/i }));
    fireEvent.click(screen.getByRole("button", { name: /keep going/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/abandon this session/i)).not.toBeInTheDocument();
  });

  it("a failed delete shows a gentle message and does NOT refresh", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<AbandonSessionButton sessionId="sess_1" />);
    fireEvent.click(screen.getByRole("button", { name: /^abandon$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^abandon$/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });
});
