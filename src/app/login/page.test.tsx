// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Boundary mocks only. The login page calls the better-auth client (signIn.email
// / signIn.magicLink / signIn.social) and uses next/navigation's useRouter +
// useSearchParams (for the callbackUrl). Nothing else is mocked — the real form,
// validation, and error rendering run. Factory-referenced vars go through
// vi.hoisted so they exist when vi.mock runs.
const { signInEmail, signInMagicLink, signInSocial, push, getSearchParams, setSearchParams } =
  vi.hoisted(() => {
    let current = new URLSearchParams();
    return {
      signInEmail: vi.fn(),
      signInMagicLink: vi.fn(),
      signInSocial: vi.fn(),
      push: vi.fn(),
      getSearchParams: () => current,
      setSearchParams: (sp: URLSearchParams) => {
        current = sp;
      },
    };
  });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => getSearchParams(),
}));
vi.mock("@/lib/auth-client", () => ({
  signIn: {
    email: signInEmail,
    magicLink: signInMagicLink,
    social: signInSocial,
  },
}));

import LoginPage from "./page";

function emailField(): HTMLInputElement {
  return screen.getByPlaceholderText("you@example.com") as HTMLInputElement;
}
function passwordField(): HTMLInputElement {
  // Single password field on the login form (placeholder is the bullet string).
  return screen.getByPlaceholderText("••••••••") as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  setSearchParams(new URLSearchParams());
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("LoginPage", () => {
  it("password sign-in: normalizes email, calls signIn.email and redirects to the default callbackUrl on success", async () => {
    signInEmail.mockResolvedValueOnce({ data: {}, error: null });
    render(<LoginPage />);

    fireEvent.change(emailField(), { target: { value: "  Person@Example.COM  " } });
    fireEvent.change(passwordField(), { target: { value: "hunter2pw" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections"));

    // better-auth signIn.email gets the normalized (lowercased + trimmed) email.
    expect(signInEmail).toHaveBeenCalledWith({
      email: "person@example.com",
      password: "hunter2pw",
    });
  });

  it("honors ?callbackUrl from the query string on successful sign-in", async () => {
    signInEmail.mockResolvedValueOnce({ data: {}, error: null });
    setSearchParams(new URLSearchParams("callbackUrl=/collections/abc/items"));
    render(<LoginPage />);

    fireEvent.change(emailField(), { target: { value: "a@b.com" } });
    fireEvent.change(passwordField(), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/collections/abc/items"),
    );
  });

  it("login failure: signIn.email returns an error → message shown, NO redirect", async () => {
    signInEmail.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid email or password" },
    });
    render(<LoginPage />);

    fireEvent.change(emailField(), { target: { value: "a@b.com" } });
    fireEvent.change(passwordField(), { target: { value: "wrongpass" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(screen.getByText("Invalid email or password")).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("login throw: signIn.email rejecting surfaces the generic error and does NOT redirect", async () => {
    signInEmail.mockRejectedValueOnce(new Error("network down"));
    render(<LoginPage />);

    fireEvent.change(emailField(), { target: { value: "a@b.com" } });
    fireEvent.change(passwordField(), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(
        screen.getByText("An error occurred. Please try again."),
      ).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("magic link: the secondary button calls signIn.magicLink and shows the check-your-email screen (no redirect)", async () => {
    signInMagicLink.mockResolvedValueOnce({ data: {}, error: null });
    render(<LoginPage />);

    fireEvent.change(emailField(), { target: { value: " Me@Example.com " } });
    fireEvent.click(screen.getByRole("button", { name: /sign-in link/i }));

    await waitFor(() =>
      expect(screen.getByText("Check your email")).toBeInTheDocument(),
    );
    expect(signInMagicLink).toHaveBeenCalledWith({
      email: "me@example.com",
      callbackURL: "/collections",
    });
    // Magic link swaps to the confirmation view rather than navigating.
    expect(push).not.toHaveBeenCalled();
  });

  it("google: the Continue with Google button calls signIn.social with the google provider", async () => {
    signInSocial.mockResolvedValueOnce({ data: {}, error: null });
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() =>
      expect(signInSocial).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/collections",
      }),
    );
  });

  it("google: a provider error surfaces without navigating", async () => {
    signInSocial.mockResolvedValueOnce({
      data: null,
      error: { message: "Google sign-in is unavailable right now." },
    });
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() =>
      expect(
        screen.getByText("Google sign-in is unavailable right now."),
      ).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
