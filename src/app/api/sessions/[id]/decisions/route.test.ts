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
  mockCapture,
  mockFlush,
  mockShutdown,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  mockRequireAccess: vi.fn(),
  mockGetSessionOrNull: vi.fn(),
  mockWithTransaction: vi.fn(),
  mockLogDbError: vi.fn(),
  mockCapture: vi.fn(),
  mockFlush: vi.fn().mockResolvedValue(undefined),
  mockShutdown: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/dal/collection-access", () => ({ requireApiCollectionAccess: mockRequireAccess }));
vi.mock("@/server/api/sessions", () => ({
  SessionController: { fromDb: () => ({ getSessionOrNull: mockGetSessionOrNull }) },
}));
vi.mock("@/lib/transactions", () => ({ withTransaction: mockWithTransaction, lockCollectionCurator: vi.fn() }));
vi.mock("@/lib/db-error-log", () => ({ logDbError: mockLogDbError }));
// PostHog stub: the success path captures then FLUSHES (delivers the queued
// event without closing the shared singleton). It must NOT shutdown per-emit —
// that would break later captures in the same warm serverless instance.
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: mockCapture, flush: mockFlush, shutdown: mockShutdown }),
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
  // status: "active" — an in-progress session clears the duv4 status gate so
  // these observability/analytics paths are reached (a terminal session 409s first).
  mockGetSessionOrNull.mockResolvedValue({ collectionId: COLLECTION, curatorId: CURATOR, status: "active" });
  mockRequireAccess.mockResolvedValue({ ok: true }); // not a NextResponse → access granted
});

describe("decisions route — DB failure observability", () => {
  it("does NOT double-log on a tx failure — withTransaction owns the emit — but still returns 500", async () => {
    // purses-4kfx: withTransaction is invoked with op:"record_decision" + the
    // same {collectionId, curatorId, sessionId} ctx, so its own catch already
    // calls logDbError + emits db_action_failed once and rethrows. The route's
    // outer catch must NOT log again (that produced 2× [db_error] / 2× events),
    // yet must still map the error to a 500.
    const boom = new Error("statement timeout");
    (boom as { code?: string }).code = "57014";
    mockWithTransaction.mockRejectedValue(boom);

    const res = await POST(req({ type: "triage", decision: { itemId: "itm_1", result: "top" } }), {
      params: { id: SESSION },
    });

    expect(res.status).toBe(500);
    // The route no longer logs — withTransaction's catch is the single emitter.
    expect(mockLogDbError).not.toHaveBeenCalled();
  });

  it("passes op + full ids ctx into withTransaction so the seam's emit loses no context", async () => {
    // Guards against re-introducing a route-level log by proving the context the
    // route removed is fully threaded into withTransaction (the sole emitter).
    mockWithTransaction.mockResolvedValue({ event: { id: "event_1" }, isNew: false });

    await POST(req({ type: "triage", decision: { itemId: "itm_1", result: "top" }, clientKey: "k1" }), {
      params: { id: SESSION },
    });

    const opts = mockWithTransaction.mock.calls[0][2];
    expect(opts.op).toBe("record_decision");
    expect(opts.ctx).toEqual({ collectionId: COLLECTION, curatorId: CURATOR, sessionId: SESSION });
  });
});

describe("decisions route — analytics client lifecycle (purses-icut)", () => {
  it("flushes (not shutdown) after a new-decision capture so the shared singleton stays open", async () => {
    // A NEW decision emits sort_decision_recorded. Serverless delivery must be
    // guaranteed before return via flush() — NOT shutdown(), which would close
    // the shared singleton and break later captures in the same warm instance.
    mockWithTransaction.mockResolvedValue({ event: { id: "event_1" }, isNew: true });

    const res = await POST(req({ type: "triage", decision: { itemId: "itm_1", result: "top" } }), {
      params: { id: SESSION },
    });

    expect(res.status).toBe(201);
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture.mock.calls[0][0].event).toBe("sort_decision_recorded");
    // Delivery guaranteed via flush; the singleton is never shut down per-emit.
    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockShutdown).not.toHaveBeenCalled();
  });
});
