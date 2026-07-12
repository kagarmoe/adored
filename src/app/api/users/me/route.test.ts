import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression test for purses-hiez: hand-rolled route catches used to echo the raw
// error.message (driver text, constraint names) to the caller. GET /api/users/me is
// the representative case — the routes now go through errorResponse.
const { mockGetSession, mockGetDb, mockGetCurrentUser } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  mockGetCurrentUser: vi.fn(),
}));

// Fully mocked: importing the real @/lib/auth pulls in env validation.
// errorResponse needs UnauthorizedError from this module, so stub it too.
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/api/users", () => ({
  UserController: { fromDb: () => ({ getCurrentUser: mockGetCurrentUser }) },
}));

import { GET } from "./route";

const INTERNAL = 'relation "users" does not exist';

describe("GET /api/users/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ db: "fake" });
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // Deployed (NODE_ENV=production — which on Vercel covers PREVIEW too, not just prod)
  // the body is curated copy + an errorId only. The full detail is inlined ONLY when
  // running locally; see src/server/api/http-errors.test.ts.
  it("does not leak the underlying error message on an unexpected failure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockGetCurrentUser.mockRejectedValue(new Error(INTERNAL));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("relation");
    expect(body.error).toBe("Something went wrong. Please try again.");
    vi.unstubAllEnvs();
  });

  it("still returns 401 for an unauthenticated caller", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });
});
