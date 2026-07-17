// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CopyInviteLinkButton } from "./CopyInviteLinkButton";

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

describe("CopyInviteLinkButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a secondary 'Copy link' button and an empty status region", () => {
    stubClipboard();
    render(<CopyInviteLinkButton token="tok_1" />);
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("writes the invitation URL to the clipboard on click", async () => {
    const writeText = stubClipboard();
    render(<CopyInviteLinkButton token="tok_abc123" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invitations/tok_abc123`);
  });

  it("flips the label to 'Copied' and announces it via the status region, then reverts after ~2s", async () => {
    stubClipboard();
    render(<CopyInviteLinkButton token="tok_1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });

    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Invite link copied");

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("on a clipboard failure, never flips to 'Copied' and shows a gentle fallback status instead", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<CopyInviteLinkButton token="tok_1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });

    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't copy — try again.");
  });
});
