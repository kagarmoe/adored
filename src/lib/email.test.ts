import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// email.ts constructs a Resend client lazily from RESEND_API_KEY and caches the
// module-level singleton. To exercise the key-set vs key-unset paths we stub
// process.env, vi.resetModules() to clear caches, and dynamically import a fresh
// copy per test. The `resend` package is mocked so no network I/O ever happens.

const ORIGINAL_ENV = process.env;
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

describe("sendInvitation — with RESEND_API_KEY set", () => {
  it("builds ${AUTH_URL}/invitations/${token} and sends it in the html, returning {sent:true}", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const { sendInvitation } = await import("./email");

    const result = await sendInvitation({ to: "invitee@example.com", token: "INVITE_TOKEN" });

    expect(result).toEqual({ sent: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg.from).toBe("noreply@kimberlygarmoe.com");
    expect(arg.to).toBe("invitee@example.com");
    expect(arg.html).toContain("https://adored.example.com/invitations/INVITE_TOKEN");
    expect(arg.cc).toBeUndefined();
    expect(arg.bcc).toBeUndefined();
  });
});

describe("graceful fallback — RESEND_API_KEY unset", () => {
  it("does NOT construct a client, does NOT send, does NOT throw, and returns {sent:false}", async () => {
    delete process.env.RESEND_API_KEY;
    const { Resend } = await import("resend");
    const { sendInvitation } = await import("./email");

    await expect(
      sendInvitation({ to: "invitee@example.com", token: "t" }),
    ).resolves.toEqual({ sent: false });

    expect(Resend).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sendInvitation no-ops WITHOUT touching AUTH_URL when the key is unset", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.AUTH_URL;
    const { sendInvitation } = await import("./email");

    await expect(
      sendInvitation({ to: "invitee@example.com", token: "t" }),
    ).resolves.toEqual({ sent: false });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does NOT log the token outside development (NODE_ENV=test)", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.NODE_ENV = "test";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendInvitation } = await import("./email");

    await sendInvitation({ to: "invitee@example.com", token: "SECRET" });

    for (const call of log.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("SECRET");
    }
    log.mockRestore();
  });

  it("logs the invitation link for local dev only when NODE_ENV=development", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.NODE_ENV = "development";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendInvitation } = await import("./email");

    await sendInvitation({ to: "invitee@example.com", token: "DEVLINK" });

    const logged = log.mock.calls.map((c) => JSON.stringify(c)).join("\n");
    expect(logged).toContain("https://adored.example.com/invitations/DEVLINK");
    log.mockRestore();
  });

  it("logs the EXACT static console.error string in production — never interpolates token/email (Security pin)", async () => {
    delete process.env.RESEND_API_KEY;
    vi.stubEnv("NODE_ENV", "production");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendInvitation } = await import("./email");

    await sendInvitation({ to: "invitee@example.com", token: "SECRET_TOKEN" });

    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(
      "[email] RESEND_API_KEY missing — invitation email NOT sent",
    );
    errSpy.mockRestore();
  });

  it("does NOT console.error in non-production envs when the key is unset", async () => {
    delete process.env.RESEND_API_KEY;
    vi.stubEnv("NODE_ENV", "test");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendInvitation } = await import("./email");

    await sendInvitation({ to: "invitee@example.com", token: "t" });

    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("Resend API error — never leaks token/url", () => {
  it("throws without including the invitation url/token in the thrown error", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.NODE_ENV = "production";
    sendMock.mockResolvedValue({ data: null, error: { message: "rate limited", name: "rate_limit" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendInvitation } = await import("./email");

    let thrown: unknown;
    try {
      await sendInvitation({ to: "invitee@example.com", token: "SECRET_TOKEN" });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toContain("SECRET_TOKEN");
    expect((thrown as Error).message).not.toContain("/invitations/");
    for (const call of errSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("SECRET_TOKEN");
    }
    errSpy.mockRestore();
  });
});
