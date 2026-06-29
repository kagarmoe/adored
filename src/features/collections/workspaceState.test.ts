import { describe, expect, it } from "vitest";
import { resolveWorkspaceState } from "./workspaceState";

// The adaptive precedence (pool before items) lives in exactly one place so the
// page never re-derives it in JSX (spec §8). These assertions are on `kind`,
// never incidental DOM order.
describe("resolveWorkspaceState", () => {
  it("is pool-first when pool photos exist, even if items also exist", () => {
    expect(resolveWorkspaceState(6, 12).kind).toBe("pool-first");
    expect(resolveWorkspaceState(1, 0).kind).toBe("pool-first");
  });

  it("is items-first when there are no pool photos but items exist", () => {
    expect(resolveWorkspaceState(0, 12).kind).toBe("items-first");
    expect(resolveWorkspaceState(0, 1).kind).toBe("items-first");
  });

  it("is empty when neither pool photos nor items exist", () => {
    expect(resolveWorkspaceState(0, 0).kind).toBe("empty");
  });
});
