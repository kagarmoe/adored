import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Optimistic middleware (Cutover Pass 1, Phase 3). Middleware is a UX redirect
// only — it checks better-auth's session-cookie PRESENCE (no DB read at the
// edge). Real enforcement stays in the DAL. We mock getSessionCookie to drive
// the presence branch and assert: cookie → pass through; no cookie → redirect
// to /login; SESSIONLESS_POST_ROUTES → allowed even without a cookie.

const getSessionCookie = vi.fn();
vi.mock("better-auth/cookies", () => ({ getSessionCookie }));

async function run(pathname: string) {
  const mod = await import("./middleware");
  const req = new NextRequest(new URL(`https://adored.example.com${pathname}`));
  return mod.default(req);
}

beforeEach(() => {
  vi.resetModules();
  getSessionCookie.mockReset();
});

describe("optimistic auth middleware", () => {
  it("passes an authenticated request through (cookie present)", async () => {
    getSessionCookie.mockReturnValue("some-session-token");
    const res = await run("/collections");
    // NextResponse.next() has no redirect Location header.
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("redirects an unauthenticated request to /login (no cookie)", async () => {
    getSessionCookie.mockReturnValue(null);
    const res = await run("/collections/col_1/pool");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("lets the Blob upload-completion callback through without a cookie", async () => {
    // Server-to-server POST with no session cookie; SESSIONLESS_POST_ROUTES.
    getSessionCookie.mockReturnValue(null);
    const res = await run("/api/collections/col_1/pool/upload");
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("does NOT exempt a forged path that merely contains the upload segment", async () => {
    getSessionCookie.mockReturnValue(null);
    const res = await run("/api/collections/col_1/pool/upload/extra");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });
});
