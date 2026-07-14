import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env;

const BASE_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://user:pass@localhost:5432/adored",
  AUTH_URL: "https://adored.example.com",
  AUTH_SECRET: "x".repeat(32),
  EMAIL_FROM: "noreply@kimberlygarmoe.com",
};

beforeEach(() => {
  vi.resetModules();
  process.env = { ...BASE_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("auth-server — Google-only better-auth instance", () => {
  it("constructs the `auth` instance without email/password or magic-link auth", async () => {
    const mod = await import("./auth-server");

    expect(mod.auth).toBeDefined();
    expect(mod.auth.handler).toBeTypeOf("function");
    expect(mod.auth.api).toBeDefined();
    expect(mod.auth.options.emailAndPassword).toBeUndefined();
    expect(mod.auth.options.socialProviders).toEqual({
      google: {
        clientId: "",
        clientSecret: "",
      },
    });
    const pluginIds = (mod.auth.options.plugins ?? []).map((plugin) => {
      if (typeof plugin === "object" && plugin !== null && "id" in plugin) {
        return String((plugin as { id?: unknown }).id);
      }
      return "";
    });
    expect(pluginIds).not.toContain("magic-link");
  });

  it("reads configured Google credentials when present", async () => {
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";

    const mod = await import("./auth-server");

    expect(mod.auth.options.socialProviders).toEqual({
      google: {
        clientId: "google-client-id",
        clientSecret: "google-client-secret",
      },
    });
  });

  it("resolves baseURL from validated env's VERCEL_URL fallback when AUTH_URL is unset (preview deploy)", async () => {
    delete process.env.AUTH_URL;
    delete process.env.BETTER_AUTH_URL;
    process.env.VERCEL_URL = "preview-abc123.vercel.app";

    const mod = await import("./auth-server");
    expect(mod.auth.options.baseURL).toBe("https://preview-abc123.vercel.app");
  });

  it("prefers an explicit BETTER_AUTH_URL over the env-derived fallback", async () => {
    process.env.BETTER_AUTH_URL = "https://override.example.com";
    process.env.VERCEL_URL = "preview-abc123.vercel.app";

    const mod = await import("./auth-server");
    expect(mod.auth.options.baseURL).toBe("https://override.example.com");
  });

  it("trusts the preview branch alias, which better-auth would otherwise reject (403 INVALID_ORIGIN)", async () => {
    delete process.env.AUTH_URL;
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "adored-abc123-team.vercel.app";
    process.env.VERCEL_BRANCH_URL = "adored-git-my-branch-team.vercel.app";

    const mod = await import("./auth-server");
    expect(mod.auth.options.trustedOrigins).toContain("https://adored-git-my-branch-team.vercel.app");
  });

  it("adds NO trusted origin in production — the trusted set stays exactly origin(AUTH_URL)", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "adored-abc123-team.vercel.app";
    process.env.VERCEL_BRANCH_URL = "adored-git-main-team.vercel.app";

    const mod = await import("./auth-server");
    expect(mod.auth.options.trustedOrigins).toEqual([]);
  });
});
