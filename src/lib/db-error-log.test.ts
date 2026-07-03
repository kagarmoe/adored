import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// logDbError is the production DB failure sink. It must (1) classify the pg
// error code, (2) emit a structured, greppable console.error with IDS ONLY,
// (3) capture a PostHog db_action_failed event with no PII, and (4) NEVER
// throw — a logging failure can't be allowed to mask the caller's real error.

const { mockCapture, mockFlush, mockSchedule } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockFlush: vi.fn().mockResolvedValue(undefined),
  mockSchedule: vi.fn(),
}));

vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: mockCapture, flush: mockFlush }),
}));

vi.mock("@/lib/wait-until", () => ({
  scheduleWaitUntil: mockSchedule,
}));

import { logDbError, classifyDbError } from "./db-error-log";

// A pg error can carry its code at .code or, when wrapped by the driver, at
// .cause.code — the classifier must read both (the isUniqueViolation pattern).
function pgError(code: string, wrapped = false): Error {
  const err = new Error("boom");
  if (wrapped) (err as { cause?: unknown }).cause = { code };
  else (err as { code?: string }).code = code;
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("classifyDbError — pg code → class", () => {
  it("maps 23505 to unique", () => {
    expect(classifyDbError(pgError("23505"))).toBe("unique");
  });
  it("maps 57014 to statement_timeout", () => {
    expect(classifyDbError(pgError("57014"))).toBe("statement_timeout");
  });
  it("maps 40P01 to deadlock", () => {
    expect(classifyDbError(pgError("40P01"))).toBe("deadlock");
  });
  it("maps 40001 to serialization_failure", () => {
    expect(classifyDbError(pgError("40001"))).toBe("serialization_failure");
  });
  it("maps any 08* code to connection", () => {
    expect(classifyDbError(pgError("08006"))).toBe("connection");
    expect(classifyDbError(pgError("08003"))).toBe("connection");
  });
  it("maps an unrecognized code to unknown", () => {
    expect(classifyDbError(pgError("99999"))).toBe("unknown");
  });
  it("maps a code-less error to unknown", () => {
    expect(classifyDbError(new Error("no code"))).toBe("unknown");
  });
  it("reads the code from err.cause.code when wrapped by the driver", () => {
    expect(classifyDbError(pgError("57014", true))).toBe("statement_timeout");
  });
});

describe("logDbError — structured console.error", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  it("emits the greppable [db_error] prefix with op, code, class and the id ctx", () => {
    logDbError(
      "record_decision",
      { collectionId: "col_1", curatorId: "usr_1", sessionId: "ses_1", itemId: "itm_1" },
      pgError("57014"),
    );

    expect(errSpy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = errSpy.mock.calls[0];
    expect(prefix).toBe("[db_error]");
    const parsed = JSON.parse(payload as string);
    expect(parsed.op).toBe("record_decision");
    expect(parsed.code).toBe("57014");
    expect(parsed.class).toBe("statement_timeout");
    expect(parsed.collectionId).toBe("col_1");
    expect(parsed.curatorId).toBe("usr_1");
    expect(parsed.sessionId).toBe("ses_1");
    expect(parsed.itemId).toBe("itm_1");
    // A timeout is a rollback the caller couldn't see — surface the flag.
    expect(parsed.rolledBack).toBe(true);
  });

  it("logs NO email/token/PII — only ids, op, code, class, message appear", () => {
    logDbError("transaction", { curatorId: "usr_1" }, pgError("40001"));

    const payload = errSpy.mock.calls[0][1] as string;
    // The whole serialized line must not carry anything PII-shaped.
    expect(payload).not.toMatch(/@/); // no emails
    expect(payload).not.toMatch(/token/i);
    expect(payload).not.toMatch(/password/i);
    const parsed = JSON.parse(payload);
    // Only the sanctioned keys — nothing smuggled in.
    const allowed = new Set([
      "op",
      "code",
      "class",
      "message",
      "rolledBack",
      "collectionId",
      "curatorId",
      "sessionId",
      "itemId",
    ]);
    for (const key of Object.keys(parsed)) expect(allowed.has(key)).toBe(true);
  });
});

describe("logDbError — PostHog db_action_failed event", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("captures db_action_failed with op/code/class and no PII in properties", () => {
    logDbError("record_decision", { curatorId: "usr_1" }, pgError("40P01"));

    expect(mockCapture).toHaveBeenCalledTimes(1);
    const arg = mockCapture.mock.calls[0][0];
    expect(arg.distinctId).toBe("usr_1");
    expect(arg.event).toBe("db_action_failed");
    expect(arg.properties).toEqual({ op: "record_decision", code: "40P01", class: "deadlock" });
  });

  it("falls back to distinctId 'system' when there is no curatorId", () => {
    logDbError("transaction", {}, pgError("08006"));
    expect(mockCapture.mock.calls[0][0].distinctId).toBe("system");
  });
});

describe("logDbError — schedules a post-response flush (serverless freeze safety)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("schedules flush() via scheduleWaitUntil so the event survives a freeze", () => {
    const flushPromise = Promise.resolve();
    mockFlush.mockReturnValueOnce(flushPromise);

    logDbError("record_decision", { curatorId: "usr_1" }, pgError("23505"));

    // capture then flush — flush is what guarantees delivery after the response.
    expect(mockFlush).toHaveBeenCalledTimes(1);
    // The flush promise is handed to the waitUntil wrapper, NOT awaited inline
    // (no added latency on the hot path).
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule).toHaveBeenCalledWith(flushPromise);
  });

  it("never throws even if scheduleWaitUntil throws", () => {
    mockSchedule.mockImplementationOnce(() => {
      throw new Error("waitUntil exploded");
    });
    expect(() =>
      logDbError("record_decision", { curatorId: "usr_1" }, pgError("23505")),
    ).not.toThrow();
  });

  it("never throws even if flush() throws synchronously", () => {
    mockFlush.mockImplementationOnce(() => {
      throw new Error("flush exploded");
    });
    expect(() =>
      logDbError("record_decision", { curatorId: "usr_1" }, pgError("23505")),
    ).not.toThrow();
  });
});

describe("logDbError — NEVER throws", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns void even when the PostHog client throws", () => {
    mockCapture.mockImplementationOnce(() => {
      throw new Error("posthog exploded");
    });
    // Must not propagate — the caller's own error handling stays in control.
    expect(() => logDbError("record_decision", { curatorId: "usr_1" }, pgError("23505"))).not.toThrow();
  });

  it("returns void even when console.error itself throws", () => {
    (console.error as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("console exploded");
    });
    expect(() => logDbError("transaction", {}, new Error("x"))).not.toThrow();
  });
});
