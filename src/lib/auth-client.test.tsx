// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const betterAuthUseSession = vi.hoisted(() => vi.fn());
const signIn = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn());

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: betterAuthUseSession,
    signIn,
    signOut,
  }),
}));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  betterAuthUseSession.mockReset();
});

describe("auth-client dev bypass", () => {
  it("reads the server-backed dev user when npm run dev exposes the bypass", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_AUTH_BYPASS", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "user_dev", email: "dev@adored.test", name: "Dev User" }),
      }),
    );

    const { useSession, isClientDevAuthBypassEnabled } = await import("./auth-client");
    function Probe() {
      const { data } = useSession();
      return <p>{data?.user?.name ?? "loading"}</p>;
    }

    expect(isClientDevAuthBypassEnabled()).toBe(true);
    render(<Probe />);

    await waitFor(() => expect(screen.getByText("Dev User")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith("/api/users/me");
    expect(betterAuthUseSession).not.toHaveBeenCalled();
  });

  it("uses Better Auth when the public dev bypass flag is absent", async () => {
    vi.stubEnv("NODE_ENV", "development");
    betterAuthUseSession.mockReturnValue({ data: { user: { name: "Real Session" } } });
    vi.stubGlobal("fetch", vi.fn());

    const { useSession, isClientDevAuthBypassEnabled } = await import("./auth-client");
    function Probe() {
      const { data } = useSession();
      return <p>{data?.user?.name ?? "loading"}</p>;
    }

    expect(isClientDevAuthBypassEnabled()).toBe(false);
    render(<Probe />);

    expect(screen.getByText("Real Session")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
