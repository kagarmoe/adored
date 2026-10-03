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
    await expect(ensureLockTimeout(sql)).resolves.toBe("applied");
    expect(calls).toHaveLength(1);
  });

  it("refuses loudly, without a session SET, when the startup parameter did not take", async () => {
    const { sql, calls } = fakeSql([{ lock_timeout: "0" }], [], [{ lock_timeout: "5s" }]);
    await expect(ensureLockTimeout(sql)).rejects.toThrow(
      "lock_timeout not applied through this connection — run migrations against the direct URL (POSTGRES_URL_NON_POOLING)",
    );
    expect(calls).toHaveLength(1);
  });
});
