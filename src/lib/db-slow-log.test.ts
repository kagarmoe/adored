import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// logDbSlow is the production DB latency sink — the success-path mirror of
// logDbError. It must (1) emit a structured, greppable console.error with IDS
// ONLY, (2) capture a PostHog db_action_slow event whose properties are op +
// a BUCKETED ms only (never the raw ms — high cardinality), and (3) NEVER
// throw — a telemetry failure can't be allowed to break or slow the request.

const { mockCapture, mockShutdown } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockShutdown: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: mockCapture, shutdown: mockShutdown }),
}));

import { logDbSlow, bucketMs, SLOW_OP_THRESHOLD_MS } from "./db-slow-log";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SLOW_OP_THRESHOLD_MS", () => {
  it("is 1000ms", () => {
    expect(SLOW_OP_THRESHOLD_MS).toBe(1000);
  });
});

describe("bucketMs — coarse buckets to bound PostHog cardinality", () => {
  it("buckets sub-2s to 1s", () => {
    expect(bucketMs(1000)).toBe("1s");
    expect(bucketMs(1500)).toBe("1s");
    expect(bucketMs(1999)).toBe("1s");
  });
  it("buckets 2s..<5s to 2s", () => {
    expect(bucketMs(2000)).toBe("2s");
    expect(bucketMs(4999)).toBe("2s");
  });
  it("buckets 5s..<10s to 5s", () => {
    expect(bucketMs(5000)).toBe("5s");
    expect(bucketMs(9999)).toBe("5s");
  });
  it("buckets 10s..<20s to 10s", () => {
    expect(bucketMs(10000)).toBe("10s");
    expect(bucketMs(19999)).toBe("10s");
  });
  it("buckets 20s..<30s to 20s", () => {
    expect(bucketMs(20000)).toBe("20s");
    expect(bucketMs(29999)).toBe("20s");
  });
  it("buckets 30s and up to 30s+", () => {
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

  it("emits the greppable [db_slow] prefix with op, ms and the id ctx", () => {
    logDbSlow("record_decision", 1234, {
      collectionId: "col_1",
      curatorId: "usr_1",
      sessionId: "ses_1",
      itemId: "itm_1",
    });

    expect(errSpy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = errSpy.mock.calls[0];
    expect(prefix).toBe("[db_slow]");
    const parsed = JSON.parse(payload as string);
    expect(parsed.op).toBe("record_decision");
    expect(parsed.ms).toBe(1234);
    expect(parsed.collectionId).toBe("col_1");
    expect(parsed.curatorId).toBe("usr_1");
    expect(parsed.sessionId).toBe("ses_1");
    expect(parsed.itemId).toBe("itm_1");
  });

  it("logs NO email/token/PII — only ids, op, ms appear", () => {
    logDbSlow("materialize_result", 2500, { curatorId: "usr_1" });

    const payload = errSpy.mock.calls[0][1] as string;
    expect(payload).not.toMatch(/@/); // no emails
    expect(payload).not.toMatch(/token/i);
    expect(payload).not.toMatch(/password/i);
    const parsed = JSON.parse(payload);
    const allowed = new Set(["op", "ms", "collectionId", "curatorId", "sessionId", "itemId"]);
    for (const key of Object.keys(parsed)) expect(allowed.has(key)).toBe(true);
  });
});

describe("logDbSlow — PostHog db_action_slow event (op + ms_bucket ONLY)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("captures db_action_slow with op + ms_bucket and NOTHING else — no ms, no ids", () => {
    logDbSlow("record_decision", 3200, {
      collectionId: "col_1",
      curatorId: "usr_1",
      sessionId: "ses_1",
    });

    expect(mockCapture).toHaveBeenCalledTimes(1);
    const arg = mockCapture.mock.calls[0][0];
    expect(arg.distinctId).toBe("usr_1");
    expect(arg.event).toBe("db_action_slow");
    // Properties are op + ms_bucket ONLY. No raw ms (cardinality), no ids (PII).
    expect(arg.properties).toEqual({ op: "record_decision", ms_bucket: "2s" });
  });

  it("falls back to distinctId 'system' when there is no curatorId", () => {
    logDbSlow("materialize_result", 1200, {});
    expect(mockCapture.mock.calls[0][0].distinctId).toBe("system");
  });
});

describe("logDbSlow — NEVER throws", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns void even when the PostHog client throws", () => {
    mockCapture.mockImplementationOnce(() => {
      throw new Error("posthog exploded");
    });
    expect(() => logDbSlow("record_decision", 1500, { curatorId: "usr_1" })).not.toThrow();
  });

  it("returns void even when console.error itself throws", () => {
    (console.error as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("console exploded");
    });
    expect(() => logDbSlow("transaction", 1500, {})).not.toThrow();
  });
});
