import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { benchVerdict } from "./bench-recompute";

const baseline = { n: 480, total: 0, mean: 20, p50: 19.8, p95: 25.4, max: 42.5 };
const at = (p95: number) => ({ ...baseline, p95 });

describe("benchVerdict", () => {
  it("fails on a catastrophic (multiple-x) compare p95 regression", () => {
    const v = benchVerdict(at(baseline.p95 * 4.5), baseline);
    expect(v.failed).toBe(true);
  });

  // 1.6× is roughly what a GitHub runner already costs us vs the dev-Mac
  // baseline (hardware, not a regression) — the gate must not flake on it.
  it("passes at the hardware-noise ratio CI actually observes", () => {
    const v = benchVerdict(at(baseline.p95 * 1.6), baseline);
    expect(v.failed).toBe(false);
  });
});

// benchVerdict being right is worth nothing if the process still exits 0 — the
// original bug was a blanket `.finally(() => process.exit(0))`, so a bench that
// couldn't even connect reported green and a p95 regression sailed through CI.
// The gate's actual contract is the EXIT CODE, so assert that, end to end.
describe("bench-recompute entrypoint", () => {
  it("exits non-zero when the bench cannot run (a broken gate is not a pass)", () => {
    const res = spawnSync(
      "npx",
      ["tsx", join(__dirname, "bench-recompute.ts"), "--items=1"],
      {
        // Nothing listens on :1 — stands in for any failure to produce a number.
        env: {
          ...process.env,
          DATABASE_URL_TEST: "postgresql://postgres:test@localhost:1/app_test",
        },
        encoding: "utf8",
      },
    );
    // Assert the reason too, so a missing `tsx` (also exit 1) can't green this.
    expect(res.stderr).toContain("bench-recompute: FAILED");
    expect(res.status).toBe(1);
  }, 90_000);
});
