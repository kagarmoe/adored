import { describe, expect, it, vi } from "vitest";

// Opt-in live eval: the only automated guard on ACTUAL extraction quality. Skipped
// by default (not in the PR gate); the owner runs it with RUN_LLM_EVAL=1 and a real
// ANTHROPIC_API_KEY. server-only is a build-time guard that throws in Node.
vi.mock("server-only", () => ({}));

import { extractItemDetails } from "./voice-extract";

const describeEval =
  process.env.RUN_LLM_EVAL === "1" ? describe : describe.skip;

describeEval("voice-extract live eval (hero utterances)", () => {
  it("extracts brand/color/category from the first hero utterance", async () => {
    const res = await extractItemDetails("This is a black Prada shoulder bag");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.details.brand?.toLowerCase()).toContain("prada");
    expect(res.details.color?.toLowerCase()).toContain("black");
    expect(res.details.category?.toLowerCase()).toContain("shoulder");
  }, 30_000);

  it("extracts dimensions + unit and routes the strap to otherDetails", async () => {
    const res = await extractItemDetails(
      "It's 11 inches wide, 9 inches tall, and the strap is 24 inches long",
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.details.width).toBe(11);
    expect(res.details.height).toBe(9);
    expect(res.details.unit).toBe("imperial");
    const other = (res.details.otherDetails ?? []).join(" ").toLowerCase();
    expect(other).toContain("strap");
    expect(other).toContain("24");
  }, 30_000);
});
