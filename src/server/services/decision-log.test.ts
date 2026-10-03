import { describe, expect, it, vi } from "vitest";
import { loadCuratorDecisionEvents } from "./decision-log";
import type { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import type { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";

describe("loadCuratorDecisionEvents", () => {
  it("loads every session's decisions in ONE query (purses-w7ss.7)", async () => {
    const sessions = { findByCollectionAndCurator: vi.fn().mockResolvedValue([{ id: "s1" }, { id: "s2" }]) };
    const events = [{ id: "e1" }, { id: "e2" }];
    const decisions = { findBySessions: vi.fn().mockResolvedValue(events), findBySession: vi.fn() };
    const out = await loadCuratorDecisionEvents(
      sessions as unknown as SessionRepository, decisions as unknown as DecisionEventRepository, "c", "u",
    );
    expect(out).toBe(events);
    expect(decisions.findBySessions).toHaveBeenCalledExactlyOnceWith(["s1", "s2"]);
    expect(decisions.findBySession).not.toHaveBeenCalled();
  });
});
