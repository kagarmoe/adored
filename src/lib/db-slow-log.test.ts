import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bucketMs, logDbSlow, SLOW_OP_THRESHOLD_MS } from "./db-slow-log";

// logDbSlow is the production DB latency sink: structured console only, ids
// only, and never allowed to break or slow the request.

describe("SLOW_OP_THRESHOLD_MS", () => {
  it("is 1000ms", () => {
    expect(SLOW_OP_THRESHOLD_MS).toBe(1000);
  });
});

describe("bucketMs — coarse latency buckets", () => {
  it("maps durations to stable bands", () => {
    expect(bucketMs(1000)).toBe("1s");
    expect(bucketMs(1999)).toBe("1s");
    expect(bucketMs(2000)).toBe("2s");
    expect(bucketMs(4999)).toBe("2s");
    expect(bucketMs(5000)).toBe("5s");
    expect(bucketMs(9999)).toBe("5s");
    expect(bucketMs(10000)).toBe("10s");
    expect(bucketMs(19999)).toBe("10s");
    expect(bucketMs(20000)).toBe("20s");
    expect(bucketMs(29999)).toBe("20s");
    expect(bucketMs(30000)).toBe("30s+");
    expect(bucketMs(120000)).toBe("30s+");
  });
});

describe("logDbSlow — structured [db_slow] console.error", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it("emits the greppable prefix with op, ms, and id ctx", () => {
    logDbSlow("record_decision", 1234, {
      collectionId: "col_1",
      curatorId: "usr_1",
      sessionId: "ses_1",
      itemId: "itm_1",
    });

    expect(errSpy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = errSpy.mock.calls[0];
    expect(prefix).toBe("[db_slow]");
    expect(JSON.parse(payload as string)).toEqual({
      op: "record_decision",
      ms: 1234,
      collectionId: "col_1",
      curatorId: "usr_1",
      sessionId: "ses_1",
      itemId: "itm_1",
    });
  });

  it("logs no email/token/PII and only sanctioned keys", () => {
    logDbSlow("materialize_result", 2500, { curatorId: "usr_1" });

    const payload = errSpy.mock.calls[0][1] as string;
    expect(payload).not.toMatch(/@/);
    expect(payload).not.toMatch(/token/i);
    expect(payload).not.toMatch(/password/i);
    const parsed = JSON.parse(payload);
    const allowed = new Set([
      "op",
      "ms",
      "collectionId",
      "curatorId",
      "sessionId",
      "itemId",
    ]);
    for (const key of Object.keys(parsed)) expect(allowed.has(key)).toBe(true);
  });

  it("never throws even when console.error itself throws", () => {
    errSpy.mockImplementationOnce(() => {
      throw new Error("console exploded");
    });

    expect(() => logDbSlow("transaction", 1500, {})).not.toThrow();
  });
});
