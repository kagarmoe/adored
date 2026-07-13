import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// email.ts constructs a Resend client lazily from the API key and caches the
// module-level singleton. To exercise the key-set vs key-unset paths we stub
// process.env, vi.resetModules() to clear caches, and dynamically import a fresh
// copy per test. The `resend` package is mocked so no network I/O ever happens.
//
// The URL in every one of these emails IS A BEARER TOKEN. The cc/bcc, logging and
// error-redaction assertions are not ceremony — they are what keeps a magic-link
// or invitation token from reaching a second address or a shared log. They were
// once deleted in a rewrite of this file and restored on review. Extend around
// them; do not replace them.

const ORIGINAL_ENV = process.env;

// Captures every `resend.emails.send(...)` call across the suite.
const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn(function (this: { emails: { send: typeof sendMock } }) {
    this.emails = { send: sendMock };
  }),
}));

const BASE_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://user:pass@localhost:5432/adored",
  AUTH_URL: "https://adored.example.com",
  AUTH_SECRET: "x".repeat(32),
  EMAIL_FROM: "noreply@kimberlygarmoe.com",
};

beforeEach(() => {
  vi.resetModules();
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null });
  process.env = { ...BASE_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("sendMagicLink — with a key set", () => {
  it("sends via resend.emails.send with from=EMAIL_FROM, to=identifier, url in html", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const { Resend } = await import("resend");
    const { sendMagicLink } = await import("./email");

    const url = "https://adored.example.com/api/auth/callback/email?token=SECRET_TOKEN";
    await sendMagicLink({ to: "user@example.com", url });

    expect(Resend).toHaveBeenCalledWith("re_test_key");
    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg.from).toBe("noreply@kimberlygarmoe.com");
    expect(arg.to).toBe("user@example.com");
    expect(arg.subject).toEqual(expect.any(String));
    expect(arg.subject.length).toBeGreaterThan(0);
    expect(arg.html).toContain(url);
    // The link must go ONLY to the identifier — no cc/bcc leaking the bearer token.
    expect(arg.cc).toBeUndefined();
    expect(arg.bcc).toBeUndefined();
  });
});

describe("sendInvitation — with a key set", () => {
  it("builds ${AUTH_URL}/invitations/${token} and sends it in the html", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const { sendInvitation } = await import("./email");

    await sendInvitation({ to: "invitee@example.com", token: "INVITE_TOKEN" });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg.from).toBe("noreply@kimberlygarmoe.com");
    expect(arg.to).toBe("invitee@example.com");
    // The URL is built inside sendInvitation from AUTH_URL + the token.
    expect(arg.html).toContain("https://adored.example.com/invitations/INVITE_TOKEN");
    expect(arg.cc).toBeUndefined();
    expect(arg.bcc).toBeUndefined();
  });
});

// THE BUG THIS FILE EXISTS FOR (purses-3i5s). email.ts used to call a missing key
// a "graceful fallback": skip the send, return void, let the caller report
// success. Vercel held the key under the legacy name AUTH_RESEND_KEY while the
// code read RESEND_API_KEY, so EVERY production email — magic-link sign-in AND
// every collection invitation — silently vanished for 65 days. Nothing failed,
// so nothing was noticed.
describe("no key — a missing key is a broken send, not a feature", () => {
  it("THROWS when no key is set and silence was not explicitly chosen", async () => {
    process.env.NODE_ENV = "production";
    const { Resend } = await import("resend");
    const { sendMagicLink, sendInvitation } = await import("./email");

    await expect(
      sendMagicLink({ to: "user@example.com", url: "https://adored.example.com/x?token=t" }),
    ).rejects.toThrow(/Email is not configured/);
    await expect(sendInvitation({ to: "invitee@example.com", token: "t" })).rejects.toThrow(
      /Email is not configured/,
    );

    expect(Resend).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does NOT log the url/token when it throws — the token must never reach a shared log", async () => {
    process.env.NODE_ENV = "production";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendMagicLink } = await import("./email");

    await expect(
      sendMagicLink({ to: "user@example.com", url: "https://adored.example.com/x?token=SECRET" }),
    ).rejects.toThrow();

    for (const call of [...log.mock.calls, ...err.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain("SECRET");
    }
    log.mockRestore();
    err.mockRestore();
  });

  it("logs the link for local dev only when NODE_ENV=development", async () => {
    process.env.NODE_ENV = "development";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendMagicLink } = await import("./email");

    const url = "https://adored.example.com/x?token=DEVLINK";
    await expect(sendMagicLink({ to: "user@example.com", url })).resolves.toBeUndefined();

    const logged = log.mock.calls.map((c) => JSON.stringify(c)).join("\n");
    expect(logged).toContain(url);
    log.mockRestore();
  });
});

describe("EMAIL_TRANSPORT=noop — silence must be CHOSEN, never inferred", () => {
  it("is silent, constructs no client, and does not throw", async () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_TRANSPORT = "noop";
    const { Resend } = await import("resend");
    const { sendMagicLink, sendInvitation } = await import("./email");

    await expect(
      sendMagicLink({ to: "user@example.com", url: "https://adored.example.com/x?token=t" }),
    ).resolves.toBeUndefined();
    await expect(
      sendInvitation({ to: "invitee@example.com", token: "t" }),
    ).resolves.toBeUndefined();

    expect(Resend).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("no-ops WITHOUT touching AUTH_URL", async () => {
    // Regression for a real CI failure: the no-send path must not build the invite
    // URL, so a missing AUTH_URL cannot throw. Deleting AUTH_URL makes any
    // env.AUTH_URL access throw (Environment validation failed); the no-op must
    // still resolve cleanly.
    process.env.EMAIL_TRANSPORT = "noop";
    delete process.env.AUTH_URL;
    const { sendInvitation } = await import("./email");

    await expect(
      sendInvitation({ to: "invitee@example.com", token: "t" }),
    ).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("REJECTS any other value — a typo must not silently send, nor silently not send", async () => {
    // "none" / "off" / "false" are the plausible typos. Under a loose check they
    // would fall past the noop branch and SEND FOR REAL.
    process.env.NODE_ENV = "production";
    process.env.EMAIL_TRANSPORT = "none";
    process.env.RESEND_API_KEY = "re_test_key";
    const { sendMagicLink } = await import("./email");

    await expect(
      sendMagicLink({ to: "user@example.com", url: "https://adored.example.com/x?token=t" }),
    ).rejects.toThrow(/EMAIL_TRANSPORT/);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("the key is read under either name — the 65-day outage", () => {
  it("reads the LEGACY name (AUTH_RESEND_KEY) — the one Vercel actually holds", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_RESEND_KEY = "re_legacy_key";
    const { Resend } = await import("resend");
    const { sendMagicLink } = await import("./email");

    await sendMagicLink({ to: "user@example.com", url: "https://adored.example.com/x?token=t" });

    expect(Resend).toHaveBeenCalledWith("re_legacy_key");
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("prefers the canonical name when both are set", async () => {
    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "re_canonical";
    process.env.AUTH_RESEND_KEY = "re_legacy";
    const { Resend } = await import("resend");
    const { sendMagicLink } = await import("./email");

    await sendMagicLink({ to: "user@example.com", url: "https://adored.example.com/x?token=t" });

    expect(Resend).toHaveBeenCalledWith("re_canonical");
  });
});

describe("Resend API error — never leaks token/url", () => {
  it("throws without including the url/token in the thrown error", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.NODE_ENV = "production";
    sendMock.mockResolvedValue({ data: null, error: { message: "rate limited", name: "rate_limit" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendMagicLink } = await import("./email");

    const url = "https://adored.example.com/x?token=SECRET_TOKEN";
    let thrown: unknown;
    try {
      await sendMagicLink({ to: "user@example.com", url });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toContain("SECRET_TOKEN");
    expect((thrown as Error).message).not.toContain(url);
    // And nothing logged to console.error should contain the secret.
    for (const call of errSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("SECRET_TOKEN");
    }
    errSpy.mockRestore();
  });
});
