import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

// KEEP-UNIT: this test covers only the route's OBSERVABILITY wiring — that a
// genuine DB failure calls logDbError("record_decision", ...) before the 500,
// and that an idempotent replay does NOT log. The real DB behavior is covered
// by src/lib/db/decisions-routes.integration.test.ts. So we mock the boundaries
// (auth, access, controllers, withTransaction, logDbError) and drive the two paths.
const {
  mockGetSession,
  mockGetDb,
  mockRequireAccess,
  mockGetSessionOrNull,
  mockWithTransaction,
  mockLogDbError,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  mockRequireAccess: vi.fn(),
  mockGetSessionOrNull: vi.fn(),
  mockWithTransaction: vi.fn(),
  mockLogDbError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/dal/collection-access", () => ({ requireApiCollectionAccess: mockRequireAccess }));
vi.mock("@/server/api/sessions", () => ({
  SessionController: { fromDb: () => ({ getSessionOrNull: mockGetSessionOrNull }) },
}));
vi.mock("@/lib/transactions", () => ({ withTransaction: mockWithTransaction }));
vi.mock("@/lib/db-error-log", () => ({ logDbError: mockLogDbError }));
// PostHog stub: the success/replay path calls capture()+shutdown().
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: vi.fn(), shutdown: vi.fn().mockResolvedValue(undefined) }),
}));

import { POST } from "./route";

const CURATOR = "usr_1";
const COLLECTION = "col_1";
const SESSION = "ses_1";

function req(body: unknown): any {
  return new Request(`http://localhost/api/sessions/${SESSION}/decisions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: CURATOR } });
  mockGetDb.mockReturnValue({ db: "fake" });
  mockGetSessionOrNull.mockResolvedValue({ collectionId: COLLECTION, curatorId: CURATOR });
  mockRequireAccess.mockResolvedValue({ ok: true }); // not a NextResponse → access granted
});

describe("decisions route — DB failure observability", () => {
  it("logs logDbError('record_decision', ids, error) then 500 on a genuine tx failure", async () => {
    const boom = new Error("statement timeout");
    (boom as { code?: string }).code = "57014";
    mockWithTransaction.mockRejectedValue(boom);

    const res = await POST(req({ type: "triage", decision: { itemId: "itm_1" } }), {
      params: { id: SESSION },
    });

    expect(res.status).toBe(500);
    expect(mockLogDbError).toHaveBeenCalledTimes(1);
    const [op, ctx, err] = mockLogDbError.mock.calls[0];
    expect(op).toBe("record_decision");
    expect(ctx).toEqual({ collectionId: COLLECTION, curatorId: CURATOR, sessionId: SESSION });
    expect(err).toBe(boom);
  });

  it("does NOT log on an idempotent replay (isNew === false → 200)", async () => {
    mockWithTransaction.mockResolvedValue({ event: { id: "event_1" }, isNew: false });

    const res = await POST(req({ type: "triage", decision: { itemId: "itm_1" }, clientKey: "k1" }), {
      params: { id: SESSION },
    });

    expect(res.status).toBe(200);
    expect(mockLogDbError).not.toHaveBeenCalled();
  });
});
