import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// withTransaction is the single seam every hot-path transaction flows through.
// It times db.transaction() and, when the elapsed time exceeds
// SLOW_OP_THRESHOLD_MS, emits a slow-op telemetry event (logDbSlow) — WITHOUT
// ever throwing, without altering the transaction's result or its errors, and
// WITHOUT double-emitting on the error path (logDbError stays owned by catch).

const { mockLogDbSlow } = vi.hoisted(() => ({ mockLogDbSlow: vi.fn() }));
const { mockLogDbError } = vi.hoisted(() => ({ mockLogDbError: vi.fn() }));

vi.mock("./db-slow-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db-slow-log")>();
  return { ...actual, logDbSlow: mockLogDbSlow };
});
vi.mock("./db-error-log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db-error-log")>();
  return { ...actual, logDbError: mockLogDbError };
});

import { withTransaction } from "./transactions";
import type { Database } from "@/lib/db";

// A fake db whose .transaction(cb) runs the callback with a fake tx, so the
// body executes. The clock is driven by a mocked performance.now sequence, so
// the "elapsed" is exactly nowValues[1] - nowValues[0] regardless of real time.
function fakeDb(): Database {
  return {
    transaction: (cb: (tx: unknown) => unknown) => cb({}),
  } as unknown as Database;
}

let nowSpy: ReturnType<typeof vi.spyOn>;

function driveClock(values: number[]): void {
  let i = 0;
  nowSpy = vi.spyOn(performance, "now").mockImplementation(() => values[Math.min(i++, values.length - 1)]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  nowSpy?.mockRestore();
});

describe("withTransaction — slow-op emit at the threshold boundary", () => {
  it("emits logDbSlow with op + ids ctx when elapsed EXCEEDS the threshold", async () => {
    driveClock([0, 1500]); // 1500ms elapsed > 1000ms threshold
    const ctx = { collectionId: "col_1", curatorId: "usr_1", sessionId: "ses_1" };

    const out = await withTransaction(fakeDb(), async () => "ok", {
      op: "record_decision",
      ctx,
    });

    expect(out).toBe("ok");
    expect(mockLogDbSlow).toHaveBeenCalledTimes(1);
    const [op, ms, passedCtx] = mockLogDbSlow.mock.calls[0];
    expect(op).toBe("record_decision");
    expect(ms).toBe(1500);
    expect(passedCtx).toEqual(ctx);
  });

  it("emits NOTHING when elapsed is UNDER the threshold", async () => {
    driveClock([0, 42]); // 42ms — fast, no emit
    const out = await withTransaction(fakeDb(), async () => "fast", {
      op: "record_decision",
      ctx: { curatorId: "usr_1" },
    });

    expect(out).toBe("fast");
    expect(mockLogDbSlow).not.toHaveBeenCalled();
  });

  it("does not emit exactly AT the threshold (strictly greater triggers)", async () => {
    driveClock([0, 1000]); // exactly 1000ms — not > 1000
    await withTransaction(fakeDb(), async () => "edge", { op: "record_decision" });
    expect(mockLogDbSlow).not.toHaveBeenCalled();
  });
});

describe("withTransaction — the success return value passes through untouched", () => {
  it("returns the callback's exact value (object identity preserved)", async () => {
    driveClock([0, 5]);
    const payload = { event: { id: "evt_1" }, isNew: true };
    const out = await withTransaction(fakeDb(), async () => payload);
    expect(out).toBe(payload); // same reference, unmodified
  });
});

describe("withTransaction — a throwing transaction", () => {
  function throwingDb(err: Error): Database {
    return {
      transaction: async () => {
        throw err;
      },
    } as unknown as Database;
  }

  it("propagates the error unchanged AND runs logDbError once", async () => {
    driveClock([0, 3000]); // even though slow, the error path owns the emit
    const boom = new Error("rolled back");

    await expect(
      withTransaction(throwingDb(boom), async () => "never", {
        op: "record_decision",
        ctx: { curatorId: "usr_1" },
      }),
    ).rejects.toBe(boom);

    expect(mockLogDbError).toHaveBeenCalledTimes(1);
    const [op, ctx, err] = mockLogDbError.mock.calls[0];
    expect(op).toBe("record_decision");
    expect(ctx).toEqual({ curatorId: "usr_1" });
    expect(err).toBe(boom);
  });

  it("does NOT double-emit the slow path when the transaction throws", async () => {
    driveClock([0, 3000]);
    await expect(
      withTransaction(throwingDb(new Error("x")), async () => "never", { op: "record_decision" }),
    ).rejects.toThrow();

    // The error path is logDbError's job; logDbSlow must NOT fire on failure.
    expect(mockLogDbSlow).not.toHaveBeenCalled();
  });
});

describe("withTransaction — backward-compatible signature", () => {
  it("works with the legacy (db, callback) 2-arg form — times but skips emit", async () => {
    driveClock([0, 5]);
    const out = await withTransaction(fakeDb(), async () => "legacy");
    expect(out).toBe("legacy");
    expect(mockLogDbSlow).not.toHaveBeenCalled();
  });

  it("still emits under the default op label when slow with no op given", async () => {
    driveClock([0, 2000]);
    await withTransaction(fakeDb(), async () => "slow-legacy");
    expect(mockLogDbSlow).toHaveBeenCalledTimes(1);
    expect(mockLogDbSlow.mock.calls[0][0]).toBe("transaction");
  });
});
