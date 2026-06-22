// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Boundary mocks only. The login page calls signIn (next-auth/react) and uses
// next/navigation's useRouter + useSearchParams (for the callbackUrl). Nothing
// else is mocked — the real form, validation, and error rendering run.
// Factory-referenced vars go through vi.hoisted so they exist when vi.mock runs.
const { signIn, push, getSearchParams, setSearchParams } = vi.hoisted(() => {
  let current = new URLSearchParams();
  return {
    signIn: vi.fn(),
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
vi.mock("next-auth/react", () => ({ signIn }));

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
  it("password sign-in: normalizes email, calls signIn('credentials') and redirects to the default callbackUrl on success", async () => {
    signIn.mockResolvedValueOnce({ ok: true });
    render(<LoginPage />);

    fireEvent.change(emailField(), { target: { value: "  Person@Example.COM  " } });
    fireEvent.change(passwordField(), { target: { value: "hunter2pw" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections"));

    // signIn gets the normalized (lowercased + trimmed) email and redirect:false
    // so the page controls navigation itself.
    expect(signIn).toHaveBeenCalledWith("credentials", {
      email: "person@example.com",
      password: "hunter2pw",
      redirect: false,
    });
  });

  it("honors ?callbackUrl from the query string on successful sign-in", async () => {
    signIn.mockResolvedValueOnce({ ok: true });
    setSearchParams(new URLSearchParams("callbackUrl=/collections/abc/items"));
    render(<LoginPage />);

    fireEvent.change(emailField(), { target: { value: "a@b.com" } });
    fireEvent.change(passwordField(), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/collections/abc/items"),
    );
  });

  it("login failure: signIn returns an error → message shown, NO redirect", async () => {
    signIn.mockResolvedValueOnce({ error: "Invalid email or password" });
    render(<LoginPage />);

    fireEvent.change(emailField(), { target: { value: "a@b.com" } });
    fireEvent.change(passwordField(), { target: { value: "wrongpass" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(screen.getByText("Invalid email or password")).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("login throw: signIn rejecting surfaces the generic error and does NOT redirect", async () => {
    signIn.mockRejectedValueOnce(new Error("network down"));
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

  it("magic link: the secondary button calls signIn('email') and shows the check-your-email screen (no redirect)", async () => {
    signIn.mockResolvedValueOnce({ ok: true });
    render(<LoginPage />);

    fireEvent.change(emailField(), { target: { value: " Me@Example.com " } });
    fireEvent.click(screen.getByRole("button", { name: /magic link/i }));

    await waitFor(() =>
      expect(screen.getByText("Check your email")).toBeInTheDocument(),
    );
    expect(signIn).toHaveBeenCalledWith("email", {
      email: "me@example.com",
      redirect: false,
    });
    // Magic link swaps to the confirmation view rather than navigating.
    expect(push).not.toHaveBeenCalled();
  });
});
