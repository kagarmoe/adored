// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { signInSocial, getSearchParams, setSearchParams } = vi.hoisted(() => {
  let current = new URLSearchParams();
  return {
    signInSocial: vi.fn(),
    getSearchParams: () => current,
    setSearchParams: (sp: URLSearchParams) => {
      current = sp;
    },
  };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => getSearchParams(),
}));
vi.mock("@/lib/auth-client", () => ({
  signIn: {
    social: signInSocial,
  },
}));

import LoginPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  setSearchParams(new URLSearchParams());
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("LoginPage", () => {
  it("renders only the Google login action", () => {
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Adored" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("you@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/email me a sign-in link/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /create an account/i })).not.toBeInTheDocument();
  });

  it("calls signIn.social with Google and the default callbackUrl", async () => {
    signInSocial.mockResolvedValueOnce({ data: {}, error: null });
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() =>
      expect(signInSocial).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/collections",
      }),
    );
  });

  it("honors ?callbackUrl from the query string", async () => {
    signInSocial.mockResolvedValueOnce({ data: {}, error: null });
    setSearchParams(new URLSearchParams("callbackUrl=/collections/abc/items"));
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() =>
      expect(signInSocial).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/collections/abc/items",
      }),
    );
  });

  it("surfaces a provider error without adding an alternate login path", async () => {
    signInSocial.mockResolvedValueOnce({
      data: null,
      error: { message: "Google sign-in is unavailable right now." },
    });
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() =>
      expect(
        screen.getByText("Google sign-in is unavailable right now."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByPlaceholderText("you@example.com")).not.toBeInTheDocument();
  });
});
