// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { signInSocial, getSearchParams, setSearchParams, routerPush, routerReplace } =
  vi.hoisted(() => {
    let current = new URLSearchParams();
    return {
      signInSocial: vi.fn(),
      getSearchParams: () => current,
      setSearchParams: (sp: URLSearchParams) => {
        current = sp;
      },
      routerPush: vi.fn(),
      routerReplace: vi.fn(),
    };
  });

vi.mock("next/navigation", () => ({
  useSearchParams: () => getSearchParams(),
  // No component under test calls useRouter today — this mock exists so that
  // if one ever does, the "never navigates the raw callbackUrl" assertions
  // below have something to catch it with.
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));
vi.mock("@/lib/auth-client", () => ({
  signIn: {
    social: signInSocial,
  },
}));

import LoginPage from "./page";

// jsdom refuses real cross-origin navigation (it logs "Not implemented: navigation
// to another Document" and leaves window.location.href unchanged), which would let
// a `window.location.href = callbackUrl` regression pass silently. Stub location
// with a plain, writable object so an assignment is actually observable.
const originalLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  setSearchParams(new URLSearchParams());
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { href: originalLocation.href },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
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

  describe("hostile callbackUrl — validated sink only", () => {
    // better-auth's origin-check (trustedOrigins, auth-server.ts) is what actually
    // rejects a hostile callbackUrl. That guarantee only holds if THIS component
    // never short-circuits it by navigating to the raw param itself — it must hand
    // callbackUrl to signIn.social and nothing else. See bead purses-15vu.
    it.each([
      ["protocol-relative", "//evil.com"],
      ["absolute", "https://evil.com"],
    ])("passes a hostile callbackUrl (%s) only to signIn.social, never navigates directly", async (_label, evilUrl) => {
      const startingHref = window.location.href;
      signInSocial.mockResolvedValueOnce({ data: {}, error: null });
      setSearchParams(new URLSearchParams({ callbackUrl: evilUrl }));
      render(<LoginPage />);

      fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

      await waitFor(() =>
        expect(signInSocial).toHaveBeenCalledWith({
          provider: "google",
          callbackURL: evilUrl,
        }),
      );

      expect(routerPush).not.toHaveBeenCalled();
      expect(routerReplace).not.toHaveBeenCalled();
      expect(window.location.href).toBe(startingHref);
    });
  });
});
