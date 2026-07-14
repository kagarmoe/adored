import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyDbError, logDbError } from "./db-error-log";

// logDbError is the production DB failure sink. It must classify pg error
// codes, emit one structured greppable console.error with ids only, and never
// throw. External analytics sinks are intentionally absent.

function pgError(code: string, wrapped = false): Error {
  const err = new Error("boom");
  if (wrapped) (err as { cause?: unknown }).cause = { code };
  else (err as { code?: string }).code = code;
  return err;
}

describe("classifyDbError — pg code -> class", () => {
  it("maps known pg codes", () => {
    expect(classifyDbError(pgError("23505"))).toBe("unique");
    expect(classifyDbError(pgError("57014"))).toBe("statement_timeout");
    expect(classifyDbError(pgError("40P01"))).toBe("deadlock");
    expect(classifyDbError(pgError("40001"))).toBe("serialization_failure");
  });

  it("maps connection class, unknown codes, code-less errors, and wrapped codes", () => {
    expect(classifyDbError(pgError("08006"))).toBe("connection");
    expect(classifyDbError(pgError("08003"))).toBe("connection");
    expect(classifyDbError(pgError("99999"))).toBe("unknown");
    expect(classifyDbError(new Error("no code"))).toBe("unknown");
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

  it("emits the greppable [db_error] prefix with op, code, class and id ctx", () => {
    logDbError(
      "record_decision",
      {
        collectionId: "col_1",
        curatorId: "usr_1",
        sessionId: "ses_1",
        itemId: "itm_1",
      },
      pgError("57014"),
    );

    expect(errSpy).toHaveBeenCalledTimes(1);
    const [prefix, payload] = errSpy.mock.calls[0];
    expect(prefix).toBe("[db_error]");
    const parsed = JSON.parse(payload as string);
    expect(parsed).toMatchObject({
      op: "record_decision",
      code: "57014",
      class: "statement_timeout",
      collectionId: "col_1",
      curatorId: "usr_1",
      sessionId: "ses_1",
      itemId: "itm_1",
      rolledBack: true,
    });
  });

  it("logs no email/token/PII and only sanctioned keys", () => {
    logDbError("transaction", { curatorId: "usr_1" }, pgError("40001"));

    const payload = errSpy.mock.calls[0][1] as string;
    expect(payload).not.toMatch(/@/);
    expect(payload).not.toMatch(/token/i);
    expect(payload).not.toMatch(/password/i);
    const parsed = JSON.parse(payload);
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

  it("never throws even when console.error itself throws", () => {
    errSpy.mockImplementationOnce(() => {
      throw new Error("console exploded");
    });

    expect(() => logDbError("transaction", {}, new Error("x"))).not.toThrow();
  });
});
