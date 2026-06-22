// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Boundary mocks only. SignupPage POSTs to /api/auth/signup via fetch, then
// calls signIn('credentials') and navigates via useRouter().push. The
// client-side validation (required fields, mismatch, length) is real and is
// what we want to exercise.
const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("next-auth/react", () => ({ signIn }));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import SignupPage from "./page";

function emailInput(): HTMLInputElement {
  return screen.getByPlaceholderText("you@example.com") as HTMLInputElement;
}
function passwordInputs(): HTMLInputElement[] {
  // Two password fields share the •••••••• placeholder: [0] = Password,
  // [1] = Confirm Password (render order in the form).
  return screen.getAllByPlaceholderText("••••••••") as HTMLInputElement[];
}

function fill(email: string, password: string, confirm: string) {
  fireEvent.change(emailInput(), { target: { value: email } });
  const [pw, confirmPw] = passwordInputs();
  fireEvent.change(pw, { target: { value: password } });
  fireEvent.change(confirmPw, { target: { value: confirm } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "user_1" }) }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SignupPage", () => {
  it("happy path: POSTs the normalized email + password, then signs in and redirects to /collections", async () => {
    signIn.mockResolvedValueOnce({ ok: true });
    render(<SignupPage />);

    fill("  New@Example.COM  ", "password123", "password123");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections"));

    // The signup POST carries the normalized email (lowercased + trimmed) and
    // the password, as JSON.
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe("/api/auth/signup");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      email: "new@example.com",
      password: "password123",
    });

    // After a successful create, it auto-signs-in with the same normalized creds.
    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: "new@example.com",
      password: "password123",
      redirect: false,
    });
  });

  it("validation: a password mismatch shows an error and never calls fetch", async () => {
    render(<SignupPage />);

    fill("a@b.com", "password123", "password124");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(screen.getByText("Passwords do not match")).toBeInTheDocument(),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("validation: a too-short password (< 8 chars) shows an error and never calls fetch", async () => {
    render(<SignupPage />);

    fill("a@b.com", "short7!", "short7!");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(
        screen.getByText("Password must be at least 8 characters"),
      ).toBeInTheDocument(),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("validation: missing fields are guarded before any fetch", async () => {
    render(<SignupPage />);

    // Leave everything blank.
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(screen.getByText("All fields are required")).toBeInTheDocument(),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("server/dup-email error: fetch !ok surfaces the API error, no sign-in, no redirect", async () => {
    // NOTE: the duplicate-email message returned here is the user-facing surface
    // of the signup-existence oracle tracked as purses-zeyd (timing/response
    // disclosure). This test only pins the current client behavior: it shows
    // whatever error the API returns and does not sign in or navigate.
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "An account with this email already exists" }),
    });
    render(<SignupPage />);

    fill("dupe@example.com", "password123", "password123");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(
        screen.getByText("An account with this email already exists"),
      ).toBeInTheDocument(),
    );
    expect(signIn).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("server error with no body message: falls back to the generic failure text", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    render(<SignupPage />);

    fill("x@y.com", "password123", "password123");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(
        screen.getByText("Signup failed. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(signIn).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("network throw during signup surfaces the generic error and does not redirect", async () => {
    (fetch as any).mockRejectedValueOnce(new Error("offline"));
    render(<SignupPage />);

    fill("x@y.com", "password123", "password123");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(
        screen.getByText("An error occurred. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
