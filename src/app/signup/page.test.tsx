// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Boundary mocks only. SignupPage calls the better-auth client signUp.email
// (which both creates the account AND establishes the session), then navigates
// via useRouter().push. The client-side validation (required fields, mismatch,
// length) is real and is what we want to exercise.
const { signUpEmail } = vi.hoisted(() => ({ signUpEmail: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ signUp: { email: signUpEmail } }));

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
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("SignupPage", () => {
  it("happy path: calls signUp.email with normalized email + derived name, then redirects to /collections", async () => {
    signUpEmail.mockResolvedValueOnce({ data: {}, error: null });
    render(<SignupPage />);

    fill("  New@Example.COM  ", "password123", "password123");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections"));

    // better-auth owns hashing + session; signUp.email carries the normalized
    // (lowercased + trimmed) email, the password, and a name derived from the
    // email local-part (the form doesn't collect a name).
    expect(signUpEmail).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "password123",
      name: "new",
    });
  });

  it("validation: a password mismatch shows an error and never calls signUp.email", async () => {
    render(<SignupPage />);

    fill("a@b.com", "password123", "password124");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(screen.getByText("Passwords do not match")).toBeInTheDocument(),
    );
    expect(signUpEmail).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("validation: a too-short password (< 8 chars) shows an error and never calls signUp.email", async () => {
    render(<SignupPage />);

    fill("a@b.com", "short7!", "short7!");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(
        screen.getByText("Password must be at least 8 characters"),
      ).toBeInTheDocument(),
    );
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("validation: missing fields are guarded before any signUp.email", async () => {
    render(<SignupPage />);

    // Leave everything blank.
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(screen.getByText("All fields are required")).toBeInTheDocument(),
    );
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("server/dup-email error: signUp.email returns an error → shows it, no redirect", async () => {
    signUpEmail.mockResolvedValueOnce({
      data: null,
      error: { message: "An account with this email already exists" },
    });
    render(<SignupPage />);

    fill("dupe@example.com", "password123", "password123");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(
        screen.getByText("An account with this email already exists"),
      ).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("error with no message: falls back to the generic failure text", async () => {
    signUpEmail.mockResolvedValueOnce({ data: null, error: {} });
    render(<SignupPage />);

    fill("x@y.com", "password123", "password123");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(
        screen.getByText("Signup failed. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("network throw during signup surfaces the generic error and does not redirect", async () => {
    signUpEmail.mockRejectedValueOnce(new Error("offline"));
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
