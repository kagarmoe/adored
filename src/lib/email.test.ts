import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The bug this file exists for (purses-3i5s): src/lib/email.ts used to treat a
// missing Resend key as a "graceful fallback" — skip the send, return void, let
// the caller report success. Vercel held the key under the legacy name
// AUTH_RESEND_KEY while the code read RESEND_API_KEY, so EVERY production email
// (magic-link sign-in AND every collection invitation) silently vanished for 65
// days. Nothing failed, so nothing was noticed.
//
// These tests pin the two halves of the fix: the key is read under either name,
// and an unconfigured send THROWS instead of lying.

// env.ts validates process.env lazily through a Proxy cached at module scope, so
// every case stubs a VALID baseline env, resets modules, and dynamically imports
// a fresh copy (the pattern env.test.ts documents).
const ORIGINAL_ENV = process.env;

const VALID_ENV: Record<string, string> = {
  NODE_ENV: "production", // the environment where silence used to hide
  DATABASE_URL: "postgres://user:pass@localhost:5432/adored",
  AUTH_URL: "https://adored.example.com",
  AUTH_SECRET: "x".repeat(32),
};

beforeEach(() => {
  vi.resetModules();
  process.env = { ...VALID_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.doUnmock("resend");
});

describe("email: a missing key is a broken send, not a feature", () => {
  it("THROWS when no key is set and silence was not explicitly chosen", async () => {
    const { sendMagicLink } = await import("./email");
    await expect(sendMagicLink({ to: "a@b.com", url: "https://x/y" })).rejects.toThrow(
      /Email is not configured/,
    );
  });

  it("is SILENT only when silence is explicitly chosen (EMAIL_TRANSPORT=noop)", async () => {
    process.env.EMAIL_TRANSPORT = "noop";
    const { sendMagicLink } = await import("./email");
    await expect(sendMagicLink({ to: "a@b.com", url: "https://x/y" })).resolves.toBeUndefined();
  });

  it("reads the LEGACY name — the one Vercel actually holds — and does not throw", async () => {
    process.env.AUTH_RESEND_KEY = "re_legacy_key";
    const send = vi.fn().mockResolvedValue({ error: null });
    // vitest 4 cannot `new` an arrow mock ("X is not a constructor") — the
    // constructor must be a function expression (memory: vitest4-mock-factory).
    vi.doMock("resend", () => ({
      Resend: vi.fn(function () {
        return { emails: { send } };
      }),
    }));

    const { sendMagicLink } = await import("./email");
    await sendMagicLink({ to: "a@b.com", url: "https://x/y" });

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({ to: "a@b.com" });
  });

  it("prefers the canonical name when both are set", async () => {
    process.env.RESEND_API_KEY = "re_canonical";
    process.env.AUTH_RESEND_KEY = "re_legacy";
    const ctor = vi.fn(function () {
      return { emails: { send: vi.fn().mockResolvedValue({ error: null }) } };
    });
    vi.doMock("resend", () => ({ Resend: ctor }));

    const { sendMagicLink } = await import("./email");
    await sendMagicLink({ to: "a@b.com", url: "https://x/y" });

    expect(ctor).toHaveBeenCalledWith("re_canonical");
  });
});
