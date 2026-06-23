// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
    fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe("/api/collections/coll_01ULID/invitations");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.email).toBe("curator@example.com");
    // No permission flags in the payload — the role model owns all permissions.
    expect(Object.keys(body)).toEqual(["email"]);

    // Success view replaces the form, and the callback fires.
    await waitFor(() =>
      expect(screen.getByText("Invitation sent successfully!")).toBeInTheDocument(),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Send Invitation" })).not.toBeInTheDocument();
  });

  it("a malformed email blocks submission — no fetch (native type=email guard fires before zod)", async () => {
    // The email Input is type="email" + required. A malformed value makes the
    // browser's typeMismatch validation block the submit event, so handleSubmit
    // never runs and the zod .email() backstop is never reached. Nothing is sent.
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) });

    render(<InviteForm collectionId="coll_01ULID" />);
    fireEvent.change(emailField(), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }));

    expect(emailField().validity.typeMismatch).toBe(true);
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
    expect(screen.queryByText("Invitation sent successfully!")).not.toBeInTheDocument();
  });

  it("a failing API response surfaces the server error and does NOT show success", async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "You cannot invite members" }),
    });

    render(<InviteForm collectionId="coll_01ULID" />);
    fireEvent.change(emailField(), { target: { value: "curator@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send Invitation" }));

    await waitFor(() =>
      expect(screen.getByText("You cannot invite members")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Invitation sent successfully!")).not.toBeInTheDocument();
  });
});
