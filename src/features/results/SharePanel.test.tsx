// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SortResultShare } from "@/types";
import { SharePanel } from "./SharePanel";

const share: SortResultShare = {
  id: "share_1",
  sortResultId: "result_1",
  shareToken: "tok_1",
  status: "active",
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const revoked: SortResultShare = { ...share, id: "share_2", shareToken: "tok_2", status: "revoked" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SharePanel", () => {
  it("Preview is a single link, not a button nested inside a link (SC 4.1.2)", () => {
    render(<SharePanel resultId="result_1" initialShares={[share]} />);

    const preview = screen.getByRole("link", { name: "Preview" });
    expect(preview.querySelector("button")).toBeNull();
  });

  // findByResult returns EVERY share for the result, revoked ones included. A revoked
  // share's link is dead (viewSharedResult rejects a non-active status), so rendering it
  // with Copy/Preview hands the person a link that silently 404s whoever they sent it to.
  it("does not render a revoked share as if it were live", () => {
    render(<SharePanel resultId="result_1" initialShares={[revoked]} />);

    expect(screen.queryByRole("link", { name: "Preview" })).toBeNull();
    expect(screen.getByText(/nothing shared yet/i)).toBeInTheDocument();
  });

  // Stopping a share is reversible: revokeShare only flips status to "revoked", so
  // PATCH status:"active" restores THE SAME token — the link already sent still works.
  // That is what makes an undo honest here rather than a new-link lie.
  it("stops sharing without a confirm dialog, and Undo restores the same link", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(<SharePanel resultId="result_1" initialShares={[share]} />);

    await user.click(screen.getByRole("button", { name: /stop sharing/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("link", { name: "Preview" })).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sort-results/result_1/shares/share_1",
      expect.objectContaining({ method: "DELETE" }),
    );

    await user.click(screen.getByRole("button", { name: /undo/i }));

    await waitFor(() => expect(screen.getByRole("link", { name: "Preview" })).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/sort-results/result_1/shares/share_1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ status: "active" });
    // The SAME token — the link the person already sent is live again.
    expect(screen.getByDisplayValue(/tok_1/)).toBeInTheDocument();
  });

  it("puts the link back and says so if stopping fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    render(<SharePanel resultId="result_1" initialShares={[share]} />);
    await user.click(screen.getByRole("button", { name: /stop sharing/i }));

    await waitFor(() => expect(screen.getByText(/still shared/i)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Preview" })).toBeInTheDocument();
  });
});
