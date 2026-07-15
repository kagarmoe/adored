// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileForm } from "./ProfileForm";

// Boundaries only: session refresh (better-auth) and the network (api-client).
// Everything else — controlled input, trimming, the role="status" live region,
// error routing through ErrorMessage — is the REAL component under test.
const refetch = vi.fn();
vi.mock("@/lib/auth-client", () => ({ useSession: () => ({ data: { user: {} }, refetch }) }));
// ProfileForm renders DeleteAccountSection, which reads useRouter for its
// post-delete redirect — mock next/navigation so the render doesn't throw.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const apiPatch = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiPatch: (...a: unknown[]) => apiPatch(...a) }));

beforeEach(() => {
  refetch.mockClear();
  apiPatch.mockClear();
  apiPatch.mockResolvedValue({ name: "Tessa" });
});

describe("ProfileForm", () => {
  it("renders the Name input, a disabled Email input bound to the user's email, and a Save changes button", () => {
    render(<ProfileForm initialName="Tessa" email="tessa@example.com" />);

    expect(screen.getByLabelText(/name/i)).toBeEnabled();

    const emailField = screen.getByLabelText(/email/i);
    expect(emailField).toBeDisabled();
    expect(emailField).toHaveValue("tessa@example.com");

    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("submits the trimmed name, refreshes the session, and confirms", async () => {
    render(<ProfileForm initialName={null} email="a@b.c" />);

    await userEvent.type(screen.getByLabelText(/name/i), "  Tessa  ");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/api/users/me", { name: "Tessa" }),
    );
    expect(refetch).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/saved|your name/i);
  });

  it("submits an empty name to clear it", async () => {
    render(<ProfileForm initialName="Old" email="a@b.c" />);

    await userEvent.clear(screen.getByLabelText(/name/i));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/api/users/me", { name: "" }),
    );
  });

  it("offers the Tutorials section with all four quick refresher links", () => {
    render(<ProfileForm initialName="Tessa" email="tessa@example.com" />);

    expect(screen.getByText("Tutorials")).toBeInTheDocument();
    expect(
      screen.getByText("Revisit any part of Adored when you want a quick refresher."),
    ).toBeInTheDocument();
    expect(screen.queryByText("New to Adored?")).not.toBeInTheDocument();

    const links = [
      ["Start a collection", "/tutorials/collection"],
      ["Sort and refine", "/tutorials/sort"],
      ["Invite and share", "/tutorials/sharing"],
      ["Round timers", "/tutorials/timers"],
    ] as const;

    for (const [label, href] of links) {
      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveAttribute("href", href);
      expect(link.className).toMatch(/\bh-11\b/);
    }
  });

  it("announces a failing save in an assertive live region and shows no confirmation", async () => {
    apiPatch.mockRejectedValueOnce(new Error("Something went wrong"));
    render(<ProfileForm initialName={null} email="a@b.c" />);

    await userEvent.type(screen.getByLabelText(/name/i), "Tessa");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    // The error must be in the role="alert" live region so screen readers announce it.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong"),
    );
    expect(refetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
