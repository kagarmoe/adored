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

  it("bridges AUTH_URL/AUTH_SECRET to NEXTAUTH_URL/NEXTAUTH_SECRET for NextAuth", async () => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXTAUTH_SECRET;
    const { env } = await import("./env");

    // Touch a property to trigger validateEnv()'s side effects.
    void env.AUTH_URL;

    expect(process.env.NEXTAUTH_URL).toBe("https://adored.example.com");
    expect(process.env.NEXTAUTH_SECRET).toBe("x".repeat(32));
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
