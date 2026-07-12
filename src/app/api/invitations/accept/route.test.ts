import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { InvitationAcceptError } from "@/server/services/InvitationAcceptService";
import { mockAuth } from "../../../../../e2e/fixtures/mock-auth";

// Regression test for purses-2eoy: the catch blocks used to echo the raw
// error.message. Curated InvitationAcceptError copy must survive; anything else
// must be flattened to a generic message.
const { mockGetSession, mockGetDb, mockAccept } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  mockAccept: vi.fn(),
}));

// mockAuth (not a bare getSession stub): errorResponse — now the route's only catch —
// imports UnauthorizedError from @/lib/auth and needs a real class to instanceof against.
vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/services/InvitationAcceptService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/InvitationAcceptService")>();
  return {
    InvitationAcceptError: actual.InvitationAcceptError,
    InvitationAcceptService: { fromDb: () => ({ accept: mockAccept }) },
  };
});
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: vi.fn(), flush: vi.fn().mockResolvedValue(undefined) }),
}));

import { POST } from "./route";

const INTERNAL = 'duplicate key value violates unique constraint "memberships_pkey"';

function makeReq() {
  return new NextRequest("http://localhost/api/invitations/accept?token=tok", {
    method: "POST",
  });
}

describe("POST /api/invitations/accept", () => {
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
    mockAccept.mockRejectedValue(new Error(INTERNAL));

    const res = await POST(makeReq());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("memberships_pkey");
    expect(body.error).toBe("Something went wrong. Please try again.");
    vi.unstubAllEnvs();
  });

  it("still surfaces the curated InvitationAcceptError message and status", async () => {
    mockAccept.mockRejectedValue(
      new InvitationAcceptError("This invitation is for a different account", 403),
    );

    const res = await POST(makeReq());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("This invitation is for a different account");
  });
});
