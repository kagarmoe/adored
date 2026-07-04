import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// auth-server.ts builds the better-auth `auth` instance at import time. We keep
// the DB adapter real (construction does no I/O — postgres-js is lazy) but mock
// the two collaborators we assert on: the magic-link plugin (to capture the
// options object better-auth is handed) and the email transport (to prove the
// wiring calls it). Fresh module per test via resetModules + dynamic import.

const ORIGINAL_ENV = process.env;

const BASE_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://user:pass@localhost:5432/adored",
  AUTH_URL: "https://adored.example.com",
  AUTH_SECRET: "x".repeat(32),
  EMAIL_FROM: "noreply@kimberlygarmoe.com",
};

// Captures the options object passed to magicLink({...}) so we can invoke the
// real sendMagicLink wiring and assert it forwards to the email helper.
const magicLinkOptionsCapture: { current: { sendMagicLink?: (d: { email: string; url: string; token: string }) => Promise<void> } } = {
  current: {},
};
const sendMagicLinkMock = vi.fn();

vi.mock("better-auth/plugins/magic-link", () => ({
  magicLink: vi.fn((options: { sendMagicLink: (d: { email: string; url: string; token: string }) => Promise<void> }) => {
    magicLinkOptionsCapture.current = options;
    return { id: "magic-link" };
  }),
}));

vi.mock("@/lib/email", () => ({
  sendMagicLink: sendMagicLinkMock,
}));

beforeEach(() => {
  vi.resetModules();
  sendMagicLinkMock.mockReset();
  sendMagicLinkMock.mockResolvedValue(undefined);
  magicLinkOptionsCapture.current = {};
  process.env = { ...BASE_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.clearAllMocks();
});

describe("auth-server — better-auth instance", () => {
  it("constructs the `auth` instance without throwing (Google creds absent → optional)", async () => {
    const mod = await import("./auth-server");
    expect(mod.auth).toBeDefined();
    // The public server surface better-auth exposes; a smoke check that we got
    // a real instance, not a broken partial.
    expect(mod.auth.handler).toBeTypeOf("function");
    expect(mod.auth.api).toBeDefined();
  });

  it("still constructs when BETTER_AUTH_* and GOOGLE_* are all absent", async () => {
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_URL;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const mod = await import("./auth-server");
    expect(mod.auth).toBeDefined();
  });

  it("resolves baseURL from validated env's VERCEL_URL fallback when AUTH_URL is unset (preview deploy)", async () => {
    // Preview deploys get no explicit AUTH_URL — Vercel injects VERCEL_URL
    // (hostname only). env.ts derives AUTH_URL = https://<VERCEL_URL>. Sourcing
    // baseURL from raw process.env.AUTH_URL would leave it undefined and break
    // magic-link + OAuth callback URL derivation; it must come from validated env.
    delete process.env.AUTH_URL;
    delete process.env.BETTER_AUTH_URL;
    process.env.VERCEL_URL = "preview-abc123.vercel.app";

    const mod = await import("./auth-server");
    expect(mod.auth.options.baseURL).toBe("https://preview-abc123.vercel.app");
  });

  it("prefers an explicit BETTER_AUTH_URL over the env-derived fallback", async () => {
    process.env.BETTER_AUTH_URL = "https://override.example.com";
    process.env.VERCEL_URL = "preview-abc123.vercel.app";
    // AUTH_URL is present in BASE_ENV; BETTER_AUTH_URL must still win.

    const mod = await import("./auth-server");
    expect(mod.auth.options.baseURL).toBe("https://override.example.com");
  });

  it("wires the magic-link plugin's sendMagicLink to the email helper", async () => {
    await import("./auth-server");
    const opts = magicLinkOptionsCapture.current;
    expect(opts.sendMagicLink).toBeTypeOf("function");

    await opts.sendMagicLink!({
      email: "curator@example.com",
      url: "https://adored.example.com/api/auth/magic-link/verify?token=SECRET",
      token: "SECRET",
    });

    // Forwards email→to and passes the better-auth-built url through untouched.
    expect(sendMagicLinkMock).toHaveBeenCalledTimes(1);
    expect(sendMagicLinkMock).toHaveBeenCalledWith({
      to: "curator@example.com",
      url: "https://adored.example.com/api/auth/magic-link/verify?token=SECRET",
    });
  });
});
