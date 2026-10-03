import { describe, expect, it, vi } from "vitest";
import type postgres from "postgres";
import { ensureLockTimeout } from "./lock-timeout";

// A tagged-template sql mock: each call returns the next scripted result.
function fakeSql(...results: unknown[][]) {
  const calls: string[] = [];
  const fn = vi.fn((strings: TemplateStringsArray) => {
    calls.push(strings.join("?"));
    return Promise.resolve(results.shift() ?? []);
  });
  return { sql: fn as unknown as postgres.Sql, calls };
}

describe("ensureLockTimeout (purses-w7ss.8)", () => {
  it("accepts the startup parameter when it reached the server", async () => {
    const { sql, calls } = fakeSql([{ lock_timeout: "5s" }]);
    await expect(ensureLockTimeout(sql, { direct: true })).resolves.toBe("applied");
    expect(calls).toHaveLength(1);
  });

  it("sets it per session on a direct endpoint when the startup parameter was dropped", async () => {
    const { sql, calls } = fakeSql([{ lock_timeout: "0" }], [], [{ lock_timeout: "5s" }]);
    await expect(ensureLockTimeout(sql, { direct: true })).resolves.toBe("applied-after-set");
    expect(calls).toHaveLength(3);
    expect(calls[1]).toMatch(/set lock_timeout = '5s'/);
  });

  it("refuses on a direct endpoint when the session SET did not take either", async () => {
    const { sql } = fakeSql([{ lock_timeout: "0" }], [], [{ lock_timeout: "0" }]);
    await expect(ensureLockTimeout(sql, { direct: true })).rejects.toThrow(/lock_timeout not applied/);
  });

  it("refuses on a pooled endpoint without issuing a session SET", async () => {
    const { sql, calls } = fakeSql([{ lock_timeout: "0" }], [], [{ lock_timeout: "5s" }]);
    await expect(ensureLockTimeout(sql, { direct: false })).rejects.toThrow(
      "lock_timeout not applied through this pooled connection — run migrations against a direct endpoint (set POSTGRES_URL_NON_POOLING, or let the migrator derive it from a -pooler DATABASE_URL)",
    );
    expect(calls).toHaveLength(1);
  });
});
