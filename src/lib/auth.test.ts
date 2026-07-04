import { describe, expect, it, vi, beforeEach } from "vitest";

// Façade contract test (Cutover Pass 1). getSession()/requireAuth() now read
// better-auth via auth.api.getSession, but MUST return the byte-identical shape
// the 249 call sites + the DAL depend on: { user: { id, email, name } } and a
// throwing UnauthorizedError. We mock the better-auth `auth` instance and
// next/headers, then exercise the REAL façade to prove the mapping.

const getSessionApi = vi.fn();

vi.mock("@/lib/auth-server", () => ({
  auth: { api: { getSession: getSessionApi } },
}));

// requireAuth/getSession call `await headers()`; give them a stub Headers.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ cookie: "better-auth.session_token=abc" })),
}));

beforeEach(() => {
  getSessionApi.mockReset();
});

describe("auth façade — getSession()", () => {
  it("maps better-auth's { session, user } onto exactly { user: { id, email, name } }", async () => {
    getSessionApi.mockResolvedValue({
      session: { id: "sess_1", userId: "user_1", token: "t", expiresAt: new Date() },
      user: {
        id: "user_1",
        email: "curator@example.com",
        name: "Ada",
        // Extra better-auth fields that must NOT leak into the façade shape.
        image: "https://x/y.png",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const { getSession } = await import("./auth");
    const session = await getSession();

    expect(session).toEqual({
      user: { id: "user_1", email: "curator@example.com", name: "Ada" },
    });
    // Shape must be exact: only id/email/name on user, no image/emailVerified/etc.
    expect(Object.keys(session!.user!).sort()).toEqual(["email", "id", "name"]);
  });

  it("returns null when better-auth reports no session (unauthenticated)", async () => {
    getSessionApi.mockResolvedValue(null);
    const { getSession } = await import("./auth");
    expect(await getSession()).toBeNull();
  });

  it("reflects a fresh display-name on each call (name-freshness, no stale cache)", async () => {
    const base = {
      session: { id: "s", userId: "user_1", token: "t", expiresAt: new Date() },
      user: {
        id: "user_1",
        email: "curator@example.com",
        name: "Old Name",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
    getSessionApi.mockResolvedValueOnce(base);
    const { getSession } = await import("./auth");
    expect((await getSession())!.user!.name).toBe("Old Name");

    // Profile edit → next per-request read returns the new name.
    getSessionApi.mockResolvedValueOnce({ ...base, user: { ...base.user, name: "New Name" } });
    expect((await getSession())!.user!.name).toBe("New Name");
  });
});

describe("auth façade — requireAuth()", () => {
  it("returns the user when authenticated", async () => {
    getSessionApi.mockResolvedValue({
      session: { id: "s", userId: "user_1", token: "t", expiresAt: new Date() },
      user: {
        id: "user_1",
        email: "curator@example.com",
        name: "Ada",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const { requireAuth } = await import("./auth");
    await expect(requireAuth()).resolves.toEqual({
      id: "user_1",
      email: "curator@example.com",
      name: "Ada",
    });
  });

  it("throws UnauthorizedError when there is no session", async () => {
    getSessionApi.mockResolvedValue(null);
    const { requireAuth, UnauthorizedError } = await import("./auth");
    await expect(requireAuth()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
