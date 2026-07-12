import { describe, it, expect, vi } from "vitest";
import { allocateWithRetry } from "./allocateWithRetry";

const conflict = { code: "23505" };
const isConflict = (e: unknown) => (e as { code?: string })?.code === "23505";

describe("allocateWithRetry", () => {
  it("retries a conflicting attempt and resolves", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce("ok");

    await expect(allocateWithRetry(attempt, isConflict)).resolves.toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("gives up after the attempt bound, rethrowing the last conflict", async () => {
    const attempt = vi.fn().mockRejectedValue(conflict);

    await expect(allocateWithRetry(attempt, isConflict)).rejects.toBe(conflict);
    expect(attempt).toHaveBeenCalledTimes(5);
  });

  it("rethrows a non-retryable error immediately", async () => {
    const other = new Error("boom");
    const attempt = vi.fn().mockRejectedValue(other);

    await expect(allocateWithRetry(attempt, isConflict)).rejects.toBe(other);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
