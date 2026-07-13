import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// env.ts validates process.env lazily through a Proxy and caches the result in
// a module-level variable. To exercise different environments we must stub
// process.env, vi.resetModules() to clear the cached config, then dynamically
// import a fresh copy of the module.

const ORIGINAL_ENV = process.env;

const VALID_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://user:pass@localhost:5432/adored",
  AUTH_URL: "https://adored.example.com",
  AUTH_SECRET: "x".repeat(32),
};

beforeEach(() => {
  vi.resetModules();
  // Start each test from a clean, minimal env so unrelated host vars
  // (NEXTAUTH_URL, VERCEL, etc.) don't leak across cases.
  process.env = { ...VALID_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.unstubAllGlobals();
});

describe("env validation — happy path", () => {
  it("parses a valid env and exposes the typed values", async () => {
    const { env } = await import("./env");

    expect(env.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/adored");
    expect(env.AUTH_URL).toBe("https://adored.example.com");
    expect(env.AUTH_SECRET).toBe("x".repeat(32));
    expect(env.NODE_ENV).toBe("test");
  });

  it("applies defaults for unset optional vars", async () => {
    const { env } = await import("./env");

    expect(env.EMAIL_FROM).toBe("noreply@kimberlygarmoe.com");
    expect(env.EMAIL_SERVER_HOST).toBe("localhost");
    expect(env.EMAIL_SERVER_PORT).toBe(1025); // z.coerce.number default
  });

  it("parses cleanly with the better-auth optional vars absent (app boots pre-Google)", async () => {
    const { env } = await import("./env");

    // Touch a required prop to force validateEnv(); optional vars are undefined,
    // not a validation error.
    void env.DATABASE_URL;
    expect(env.BETTER_AUTH_SECRET).toBeUndefined();
    expect(env.BETTER_AUTH_URL).toBeUndefined();
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });

  it("exposes the better-auth optional vars when present", async () => {
    process.env.BETTER_AUTH_SECRET = "y".repeat(32);
    process.env.BETTER_AUTH_URL = "https://adored.example.com";
    process.env.GOOGLE_CLIENT_ID = "gid";
    process.env.GOOGLE_CLIENT_SECRET = "gsecret";
    const { env } = await import("./env");

    expect(env.BETTER_AUTH_SECRET).toBe("y".repeat(32));
    expect(env.BETTER_AUTH_URL).toBe("https://adored.example.com");
    expect(env.GOOGLE_CLIENT_ID).toBe("gid");
    expect(env.GOOGLE_CLIENT_SECRET).toBe("gsecret");
  });

  it("derives AUTH_URL from VERCEL_URL when AUTH_URL is absent", async () => {
    delete process.env.AUTH_URL;
    process.env.VERCEL_URL = "adored-preview.vercel.app";
    const { env } = await import("./env");

    expect(env.AUTH_URL).toBe("https://adored-preview.vercel.app");
  });
});

describe("env validation — failure", () => {
  it("throws a descriptive error when a required var (AUTH_SECRET) is missing", async () => {
    delete process.env.AUTH_SECRET;
    const { env } = await import("./env");

    // Lazy Proxy: the throw happens on first property access, not on import.
    expect(() => env.DATABASE_URL).toThrow(/Environment validation failed/);
    expect(() => env.DATABASE_URL).toThrow(/AUTH_SECRET/);
  });

  it("throws when AUTH_SECRET is too short (< 32 chars)", async () => {
    process.env.AUTH_SECRET = "too-short";
    const { env } = await import("./env");

    expect(() => env.AUTH_SECRET).toThrow(/at least 32 characters/);
  });

  it("throws when DATABASE_URL is not a valid URL", async () => {
    process.env.DATABASE_URL = "not-a-url";
    const { env } = await import("./env");

    expect(() => env.DATABASE_URL).toThrow(/DATABASE_URL must be a valid URL/);
  });

  it("throws when AUTH_URL is not a valid URL", async () => {
    process.env.AUTH_URL = "not-a-url";
    const { env } = await import("./env");

    expect(() => env.AUTH_URL).toThrow(/AUTH_URL must be a valid URL/);
  });

  it("throws when EMAIL_FROM is present but not a valid email (default only covers absence)", async () => {
    process.env.EMAIL_FROM = "not-an-email";
    const { env } = await import("./env");

    expect(() => env.EMAIL_FROM).toThrow(/EMAIL_FROM must be a valid email/);
  });

  it("throws on a NODE_ENV outside the enum (default only covers absence)", async () => {
    process.env.NODE_ENV = "staging";
    const { env } = await import("./env");

    expect(() => env.NODE_ENV).toThrow(/Environment validation failed/);
    expect(() => env.NODE_ENV).toThrow(/NODE_ENV/);
  });

  it("throws on a VERCEL_ENV outside the enum (optional only covers absence)", async () => {
    process.env.VERCEL_ENV = "canary";
    const { env } = await import("./env");

    expect(() => env.VERCEL_ENV).toThrow(/Environment validation failed/);
    expect(() => env.VERCEL_ENV).toThrow(/VERCEL_ENV/);
  });

  it("throws when AUTH_SECRET is the empty string — empty must not satisfy min(32)", async () => {
    process.env.AUTH_SECRET = "";
    const { env } = await import("./env");

    expect(() => env.AUTH_SECRET).toThrow(/at least 32 characters/);
  });

  it("throws when DATABASE_URL is the empty string — empty must not satisfy url()", async () => {
    process.env.DATABASE_URL = "";
    const { env } = await import("./env");

    expect(() => env.DATABASE_URL).toThrow(/DATABASE_URL must be a valid URL/);
  });
});

describe("previewTrustedOrigins", () => {
  it("returns [] when not on Vercel (local dev)", async () => {
    const { previewTrustedOrigins } = await import("./env");
    expect(previewTrustedOrigins()).toEqual([]);
  });

  it("returns [] in production even when the Vercel host vars are present", async () => {
    // THE SECURITY LINE: production's trusted set must stay exactly origin(AUTH_URL).
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "adored-abc123-team.vercel.app";
    process.env.VERCEL_BRANCH_URL = "adored-git-main-team.vercel.app";
    const { previewTrustedOrigins } = await import("./env");

    expect(previewTrustedOrigins()).toEqual([]);
  });

  it("trusts this deployment's own URL and branch alias on a preview deploy", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "adored-abc123-team.vercel.app";
    process.env.VERCEL_BRANCH_URL = "adored-git-my-branch-team.vercel.app";
    const { previewTrustedOrigins } = await import("./env");

    expect(previewTrustedOrigins()).toEqual([
      "https://adored-abc123-team.vercel.app",
      "https://adored-git-my-branch-team.vercel.app",
    ]);
  });

  it("rejects wildcard hosts — a '*.vercel.app' pattern would trust every Vercel deploy on the internet", async () => {
    // better-auth's matchesOriginPattern treats * and ? as wildcards, so a host
    // carrying them would widen the trusted set to an attacker's own project.
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "*.vercel.app";
    process.env.VERCEL_BRANCH_URL = "adored-git-?-team.vercel.app";
    const { previewTrustedOrigins } = await import("./env");

    expect(previewTrustedOrigins()).toEqual([]);
  });
});

describe("env warnings", () => {
  it("warns when VERCEL is set but AUTH_URL is http:// (Secure-cookie footgun)", async () => {
    process.env.VERCEL = "1";
    process.env.AUTH_URL = "http://localhost:3000";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { env } = await import("./env");
    void env.AUTH_URL;

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("VERCEL is set but AUTH_URL is http://"));
    warn.mockRestore();
  });
});
