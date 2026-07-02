import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// email.ts constructs a Resend client lazily from RESEND_API_KEY and caches the
// module-level singleton. To exercise the key-set vs key-unset paths we stub
// process.env, vi.resetModules() to clear caches, and dynamically import a fresh
// copy per test. The `resend` package is mocked so no network I/O ever happens.

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

describe("sendMagicLink — with RESEND_API_KEY set", () => {
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

describe("sendInvitation — with RESEND_API_KEY set", () => {
  it("sends via resend.emails.send with from=EMAIL_FROM, to=email, url in html", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const { sendInvitation } = await import("./email");

    const url = "https://adored.example.com/invitations/INVITE_TOKEN";
    await sendInvitation({ to: "invitee@example.com", url });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg.from).toBe("noreply@kimberlygarmoe.com");
    expect(arg.to).toBe("invitee@example.com");
    expect(arg.html).toContain(url);
    expect(arg.cc).toBeUndefined();
    expect(arg.bcc).toBeUndefined();
  });
});

describe("graceful fallback — RESEND_API_KEY unset", () => {
  it("does NOT construct a client, does NOT send, does NOT throw", async () => {
    delete process.env.RESEND_API_KEY;
    const { Resend } = await import("resend");
    const { sendMagicLink, sendInvitation } = await import("./email");

    await expect(
      sendMagicLink({ to: "user@example.com", url: "https://adored.example.com/x?token=t" }),
    ).resolves.toBeUndefined();
    await expect(
      sendInvitation({ to: "invitee@example.com", url: "https://adored.example.com/invitations/t" }),
    ).resolves.toBeUndefined();

    expect(Resend).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does NOT log the url/token outside development (NODE_ENV=test)", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.NODE_ENV = "test";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendMagicLink } = await import("./email");

    await sendMagicLink({ to: "user@example.com", url: "https://adored.example.com/x?token=SECRET" });

    // No secret must reach the log outside development.
    for (const call of log.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("SECRET");
    }
    log.mockRestore();
  });

  it("logs the link for local dev only when NODE_ENV=development", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.NODE_ENV = "development";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendMagicLink } = await import("./email");

    const url = "https://adored.example.com/x?token=DEVLINK";
    await sendMagicLink({ to: "user@example.com", url });

    const logged = log.mock.calls.map((c) => JSON.stringify(c)).join("\n");
    expect(logged).toContain(url);
    log.mockRestore();
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
