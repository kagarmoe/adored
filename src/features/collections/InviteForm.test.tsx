// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

// Boundary: fetch only. InviteForm posts through the REAL @/lib/api-client
// (apiPost) and the REAL zod schema. The invite is email-only under the role model
// (no permission checkboxes — an accepted invite becomes a curator).
// It does NOT use next/navigation — success is communicated via an in-place
// success view and the onSuccess callback. Nothing to mock but fetch.
import { InviteForm } from "./InviteForm";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function emailField(): HTMLInputElement {
  return screen.getByPlaceholderText("curator@example.com") as HTMLInputElement;
}

describe("InviteForm", () => {
  it("POSTs only the email to the invitations route, then shows success and calls onSuccess", async () => {
    (fetch as any).mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });
    const onSuccess = vi.fn();

    render(<InviteForm collectionId="coll_01ULID" onSuccess={onSuccess} />);

    fireEvent.change(emailField(), { target: { value: "curator@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe("/api/collections/coll_01ULID/invitations");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.email).toBe("curator@example.com");
    // No permission flags in the payload — the role model owns all permissions.
    expect(Object.keys(body)).toEqual(["email"]);

    // Success status appears, and the callback fires.
    await waitFor(() =>
      expect(screen.getByText("Invitation sent successfully!")).toBeInTheDocument(),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);

    // The form stays mounted alongside the success status, so the user can invite
    // again immediately — and the email field was cleared.
    expect(screen.getByRole("button", { name: "Send invite" })).toBeInTheDocument();
    expect(emailField()).toBeInTheDocument();
    expect(emailField().value).toBe("");
  });

  it("a malformed email blocks submission — no fetch (native type=email guard fires before zod)", async () => {
    // The email Input is type="email" + required. A malformed value makes the
    // browser's typeMismatch validation block the submit event, so handleSubmit
    // never runs and the zod .email() backstop is never reached. Nothing is sent.
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });

    render(<InviteForm collectionId="coll_01ULID" />);
    fireEvent.change(emailField(), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    expect(emailField().validity.typeMismatch).toBe(true);
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
    expect(screen.queryByText("Invitation sent successfully!")).not.toBeInTheDocument();
  });

  it("an email the native guard accepts but zod rejects renders the inline error — no fetch (regression: zod 4 removed ZodError.errors)", async () => {
    // "a@b" satisfies the browser's type=email check (no typeMismatch), so
    // handleSubmit runs and the zod .email() backstop fires. The catch must
    // surface the schema's message — under zod 4, reading err.errors[0] threw
    // a TypeError inside the catch and the form died silently (purses-9oxh.5).
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });

    render(<InviteForm collectionId="coll_01ULID" />);
    fireEvent.change(emailField(), { target: { value: "a@b" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    expect(emailField().validity.typeMismatch).toBe(false);
    await waitFor(() => expect(screen.getByText("Invalid email address")).toBeInTheDocument());
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("Invitation sent successfully!")).not.toBeInTheDocument();
  });

  it("announces a sent invitation via role=status", async () => {
    (fetch as any).mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });

    render(<InviteForm collectionId="coll_01ULID" />);
    fireEvent.change(emailField(), { target: { value: "curator@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    // The live status region pre-exists (always mounted) so its text change is
    // announced reliably; on success it carries the confirmation text.
    expect(screen.getByRole("status")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/sent/i));
  });

  it("clears the success timer on unmount (no leaked timer)", async () => {
    vi.useFakeTimers();
    try {
      (fetch as any).mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });

      const { unmount } = render(<InviteForm collectionId="coll_01ULID" />);
      fireEvent.change(emailField(), { target: { value: "curator@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

      // Flush the awaited apiPost so success state — and its 3s auto-reset timer — is set.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole("status")).toHaveTextContent(/sent/i);
      // The auto-reset timer is now pending.
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      // Unmount BEFORE it fires. The effect cleanup must clearTimeout it: with the
      // old inline setTimeout (no cleanup) the timer would survive unmount and later
      // call setSuccess on the dead tree. getTimerCount === 0 proves it was cleared.
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the email-not-sent notice when the response carries emailSent:false — invite is still saved", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ emailSent: false }),
    });

    render(<InviteForm collectionId="coll_01ULID" />);
    fireEvent.change(emailField(), { target: { value: "curator@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "The invite is saved — the email didn't go out, so share the link yourself with Copy link.",
        ),
      ).toBeInTheDocument(),
    );
    // Announced via a persistent role=status node (same pattern as the success region).
    expect(screen.getByText(/didn't go out/i).closest('[role="status"]')).not.toBeNull();
  });

  it("does NOT show the email-not-sent notice when emailSent is true (or absent)", async () => {
    (fetch as any).mockResolvedValue({ ok: true, status: 201, json: async () => ({ emailSent: true }) });

    render(<InviteForm collectionId="coll_01ULID" />);
    fireEvent.change(emailField(), { target: { value: "curator@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() =>
      expect(screen.getByText("Invitation sent successfully!")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/didn't go out/i)).not.toBeInTheDocument();
  });

  it("a failing API response surfaces the server error and does NOT show success", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "You cannot invite members" }),
    });

    render(<InviteForm collectionId="coll_01ULID" />);
    fireEvent.change(emailField(), { target: { value: "curator@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() =>
      expect(screen.getByText("You cannot invite members")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Invitation sent successfully!")).not.toBeInTheDocument();
  });
});
