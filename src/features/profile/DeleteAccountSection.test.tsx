// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const signOut = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...args: unknown[]) => signOut(...args) }));

import { DeleteAccountSection } from "./DeleteAccountSection";

const email = "tessa@example.com";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("DeleteAccountSection", () => {
  it("a single tap only reveals the confirm — no API call, no sign-out", () => {
    render(<DeleteAccountSection email={email} />);
    fireEvent.click(screen.getByRole("button", { name: /delete your account/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("moves focus into the confirm field when the step appears", () => {
    render(<DeleteAccountSection email={email} />);
    fireEvent.click(screen.getByRole("button", { name: /delete your account/i }));
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("keeps the Delete button disabled until the email matches (case-insensitive)", () => {
    render(<DeleteAccountSection email={email} />);
    fireEvent.click(screen.getByRole("button", { name: /delete your account/i }));
    const confirmBtn = screen.getByRole("button", { name: /^delete account$/i });
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "wrong@example.com" } });
    expect(confirmBtn).toBeDisabled();
    // Case + surrounding whitespace are normalised before matching.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  TESSA@EXAMPLE.COM  " } });
    expect(confirmBtn).toBeEnabled();
  });

  it("DELETEs /api/users/me (no body) and signs out on success", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<DeleteAccountSection email={email} />);
    fireEvent.click(screen.getByRole("button", { name: /delete your account/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: email } });
    fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/users/me", { method: "DELETE" }),
    );
    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ redirect: true, callbackUrl: "/login" }),
    );
  });

  it("ignores a rapid double-submit — one delete call", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    render(<DeleteAccountSection email={email} />);
    fireEvent.click(screen.getByRole("button", { name: /delete your account/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: email } });
    const confirmBtn = screen.getByRole("button", { name: /^delete account$/i });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it("a failed delete shows a gentle message and does NOT sign out", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    render(<DeleteAccountSection email={email} />);
    fireEvent.click(screen.getByRole("button", { name: /delete your account/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: email } });
    fireEvent.click(screen.getByRole("button", { name: /^delete account$/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(signOut).not.toHaveBeenCalled();
  });

  it("Cancel backs out — no API call, confirm dismissed", () => {
    render(<DeleteAccountSection email={email} />);
    fireEvent.click(screen.getByRole("button", { name: /delete your account/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
