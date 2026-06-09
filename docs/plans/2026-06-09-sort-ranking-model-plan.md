# Sort Ranking Model Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make triage tiers and pairwise comparisons two resolutions of one ranking — triage seeds a score at its tier-band center, pairwise refines it up or down and may cross tier boundaries on consistent evidence.

**Architecture:** Rewrite `ScoringService.computePreferences` as two order-independent passes over a curator's decision events: pass 1 seeds each item at its triage band center; pass 2 applies pairwise win/loss deltas (clamped `[0,1]`), with tie = no net swing and skip = no-op. The displayed bucket is recomputed from the final score. Seeding at band centers (not edges) fixes the tier↔bucket misalignment (purses-7lh) by construction.

**Tech Stack:** TypeScript, Vitest. Single service file + co-located test. No type/schema/UI changes.

**Spec:** `docs/plans/2026-06-09-sort-ranking-model-design.md`

---

## File Structure

- **Modify:** `src/server/services/ScoringService.ts` — full rewrite of `computePreferences` and its private helpers. New module constants for tier seeds and deltas. Removes the old `scoreFromPairwiseEvent` (floored-delta) helper.
- **Modify (rewrite):** `src/server/services/ScoringService.test.ts` — replaces the interim jo2 numeric expectations with the new model and adds cross-tier, tie, Release-symmetry, confidence, and round-trip-identity cases.

No other files change. `CollectionPreferenceItem` already carries `score`/`rankBucket`/`confidence`/`comparisonCount`; tiers remain the internal `top/high/medium/low` strings.

---

## Task 1: Rewrite ScoringService to the band-center two-pass model

**Files:**
- Modify: `src/server/services/ScoringService.ts`
- Test: `src/server/services/ScoringService.test.ts`

- [ ] **Step 1: Replace the test file with the new-model specs**

Overwrite `src/server/services/ScoringService.test.ts` with exactly:

```typescript
import { describe, expect, it } from "vitest";
import { ScoringService } from "./ScoringService";
import type {
  DecisionEvent,
  PairwiseResult,
  Session,
  TriageResult,
} from "@/types";
import type { IDecisionEventRepository } from "@/server/repositories/DecisionEventRepository";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";

const COLLECTION = "col-1";
const CURATOR = "cur-1";
const SESSION = "sess-1";

function triage(itemId: string, result: TriageResult): DecisionEvent {
  return {
    id: `t-${itemId}-${result}`,
    sessionId: SESSION,
    type: "triage",
    decision: { itemId, result },
    createdAt: new Date(),
  };
}

function pairwise(
  itemAId: string,
  itemBId: string,
  result: PairwiseResult,
): DecisionEvent {
  return {
    id: `p-${itemAId}-${itemBId}-${result}`,
    sessionId: SESSION,
    type: "pairwise_compare",
    decision: { itemAId, itemBId, result },
    createdAt: new Date(),
  };
}

function buildService(decisions: DecisionEvent[]): ScoringService {
  const sessionRepo: ISessionRepository = {
    findByCollection: async () =>
      [{ id: SESSION, curatorId: CURATOR }] as unknown as Session[],
  } as ISessionRepository;

  const decisionRepo: IDecisionEventRepository = {
    findBySession: async () => decisions,
  } as IDecisionEventRepository;

  return new ScoringService(decisionRepo, sessionRepo);
}

async function scoreByItem(decisions: DecisionEvent[]) {
  const prefs = await buildService(decisions).computePreferences(
    COLLECTION,
    CURATOR,
  );
  return new Map(prefs.map((p) => [p.itemId, p]));
}

describe("ScoringService.computePreferences", () => {
  it("round-trips each triage tier to its own bucket (purses-7lh)", async () => {
    const byItem = await scoreByItem([
      triage("love", "top"),
      triage("like", "high"),
      triage("maybe", "medium"),
      triage("release", "low"),
    ]);

    expect(byItem.get("love")!.score).toBeCloseTo(0.875);
    expect(byItem.get("love")!.rankBucket).toBe("top");
    expect(byItem.get("like")!.score).toBeCloseTo(0.625);
    expect(byItem.get("like")!.rankBucket).toBe("high");
    expect(byItem.get("maybe")!.score).toBeCloseTo(0.375);
    expect(byItem.get("maybe")!.rankBucket).toBe("medium");
    expect(byItem.get("release")!.score).toBeCloseTo(0.125);
    expect(byItem.get("release")!.rankBucket).toBe("low");
  });

  it("promotes across a tier boundary after two consistent wins", async () => {
    const byItem = await scoreByItem([
      triage("a", "high"), // 0.625
      triage("b", "high"),
      pairwise("a", "b", "item_a"),
      pairwise("a", "b", "item_a"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.825);
    expect(byItem.get("a")!.rankBucket).toBe("top"); // Like -> Love
  });

  it("stays in tier after only two losses (needs three to demote)", async () => {
    const byItem = await scoreByItem([
      triage("a", "high"), // 0.625
      triage("b", "top"),
      pairwise("a", "b", "item_b"),
      pairwise("a", "b", "item_b"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.525);
    expect(byItem.get("a")!.rankBucket).toBe("high"); // still Like
  });

  it("demotes across a tier boundary after three consistent losses", async () => {
    const byItem = await scoreByItem([
      triage("a", "high"), // 0.625
      triage("b", "top"),
      pairwise("a", "b", "item_b"),
      pairwise("a", "b", "item_b"),
      pairwise("a", "b", "item_b"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.475);
    expect(byItem.get("a")!.rankBucket).toBe("medium"); // Like -> Maybe
  });

  it("rescues a Release item up into favorites (symmetric override)", async () => {
    const byItem = await scoreByItem([
      triage("a", "low"), // 0.125 (Release)
      triage("b", "low"),
      pairwise("a", "b", "item_a"),
      pairwise("a", "b", "item_a"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.325);
    expect(byItem.get("a")!.rankBucket).toBe("medium"); // out of Release
  });

  it("demotes a favorite into Release on sustained losses (symmetric override)", async () => {
    const byItem = await scoreByItem([
      triage("a", "medium"), // 0.375 (Maybe, a favorite)
      triage("b", "top"),
      pairwise("a", "b", "item_b"),
      pairwise("a", "b", "item_b"),
      pairwise("a", "b", "item_b"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.225);
    expect(byItem.get("a")!.rankBucket).toBe("low"); // Maybe -> Release
  });

  it("treats a tie as no net swing that still counts as evidence", async () => {
    const byItem = await scoreByItem([
      triage("a", "high"), // 0.625
      triage("b", "high"),
      pairwise("a", "b", "tie"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.625);
    expect(byItem.get("b")!.score).toBeCloseTo(0.625);
    expect(byItem.get("a")!.comparisonCount).toBe(2); // triage + tie
    expect(byItem.get("b")!.comparisonCount).toBe(2);
  });

  it("treats a skip as a complete no-op", async () => {
    const byItem = await scoreByItem([
      triage("a", "medium"), // 0.375
      triage("b", "medium"),
      pairwise("a", "b", "skip"),
    ]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.375);
    expect(byItem.get("b")!.score).toBeCloseTo(0.375);
    expect(byItem.get("a")!.comparisonCount).toBe(1); // skip not counted
    expect(byItem.get("b")!.comparisonCount).toBe(1);
  });

  it("counts ties but not skips toward confidence", async () => {
    const byItem = await scoreByItem([
      triage("a", "high"),
      triage("b", "high"),
      pairwise("a", "b", "tie"),
      pairwise("a", "b", "skip"),
    ]);

    expect(byItem.get("a")!.comparisonCount).toBe(2); // triage + tie only
    expect(byItem.get("a")!.confidence).toBeCloseTo(0.2);
  });

  it("defaults an un-triaged item compared in pairwise to the Maybe center", async () => {
    const byItem = await scoreByItem([pairwise("a", "b", "tie")]);

    expect(byItem.get("a")!.score).toBeCloseTo(0.375);
    expect(byItem.get("a")!.rankBucket).toBe("medium");
    expect(byItem.get("a")!.comparisonCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail against the current code**

Run: `npx vitest run src/server/services/ScoringService.test.ts`
Expected: multiple FAIL. The current code seeds at band edges (`high` = 0.75, not 0.625) and gives both items `+0.1` on a tie, so the round-trip, tie, and Release cases fail with the old numbers. This is the RED state.

- [ ] **Step 3: Rewrite the service implementation**

Overwrite `src/server/services/ScoringService.ts` with exactly:

```typescript
import type {
  CollectionPreferenceItem,
  DecisionEvent,
  PairwiseDecision,
  TriageDecision,
} from "@/types";
import type { IDecisionEventRepository } from "@/server/repositories/DecisionEventRepository";
import type { ISessionRepository } from "@/server/repositories/SessionRepository";

// Triage seeds each item at the CENTER of its tier band, so triage -> getBucket
// is an identity round-trip and every item has +/-0.125 of headroom for pairwise
// refinement to move it within, or across, a tier boundary.
const TIER_SEED = {
  top: 0.875,
  high: 0.625,
  medium: 0.375,
  low: 0.125,
} as const;

const WIN_DELTA = 0.1;
const LOSS_DELTA = 0.05;

// Defensive only: an item compared without ever being triaged cannot happen in
// the real flow (the whole collection is triaged before comparison). Seed such
// an item at the neutral Maybe center.
const UNTRIAGED_DEFAULT = TIER_SEED.medium;

type ItemState = { score: number; count: number };

export class ScoringService {
  constructor(
    private decisionRepo: IDecisionEventRepository,
    private sessionRepo: ISessionRepository,
  ) {}

  private scoreFromTriageEvent(
    result: "top" | "high" | "medium" | "low",
  ): number {
    return TIER_SEED[result];
  }

  private clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
  }

  private calculateConfidence(comparisonCount: number): number {
    return Math.min(1.0, comparisonCount / 10);
  }

  private getBucket(score: number): "top" | "high" | "medium" | "low" {
    if (score >= 0.75) return "top";
    if (score >= 0.5) return "high";
    if (score >= 0.25) return "medium";
    return "low";
  }

  async computePreferences(
    collectionId: string,
    curatorId: string,
  ): Promise<CollectionPreferenceItem[]> {
    const sessions = await this.sessionRepo.findByCollection(collectionId);
    const curatorSessions = sessions.filter((s) => s.curatorId === curatorId);

    const allDecisions: DecisionEvent[] = [];
    for (const session of curatorSessions) {
      const decisions = await this.decisionRepo.findBySession(session.id);
      allDecisions.push(...decisions);
    }

    const itemState = new Map<string, ItemState>();
    const ensure = (itemId: string): ItemState => {
      let state = itemState.get(itemId);
      if (!state) {
        state = { score: UNTRIAGED_DEFAULT, count: 0 };
        itemState.set(itemId, state);
      }
      return state;
    };

    // Pass 1: triage seeds the base score at its tier center.
    for (const decision of allDecisions) {
      if (decision.type !== "triage") continue;
      const { itemId, result } = decision.decision as TriageDecision;
      const state = ensure(itemId);
      state.score = this.scoreFromTriageEvent(result);
      state.count++;
    }

    // Pass 2: pairwise refines the seeded score. Skip is a no-op; tie counts as
    // evidence with no net swing; win/loss move the score and may cross a tier
    // boundary once accumulated deltas exceed the 0.125 headroom.
    for (const decision of allDecisions) {
      if (decision.type !== "pairwise_compare") continue;
      const { itemAId, itemBId, result } =
        decision.decision as PairwiseDecision;

      if (result === "skip") continue;

      const aState = ensure(itemAId);
      const bState = ensure(itemBId);

      if (result === "tie") {
        aState.count++;
        bState.count++;
        continue;
      }

      const [winner, loser] =
        result === "item_a" ? [aState, bState] : [bState, aState];
      winner.score = this.clamp01(winner.score + WIN_DELTA);
      loser.score = this.clamp01(loser.score - LOSS_DELTA);
      aState.count++;
      bState.count++;
    }

    const preferences: CollectionPreferenceItem[] = [];
    for (const [itemId, data] of itemState) {
      if (data.count === 0) continue;
      preferences.push({
        id: `${collectionId}-${curatorId}-${itemId}`,
        collectionId,
        curatorId,
        itemId,
        score: data.score,
        confidence: this.calculateConfidence(data.count),
        rankBucket: this.getBucket(data.score),
        comparisonCount: data.count,
        lastSeen: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return preferences;
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/server/services/ScoringService.test.ts`
Expected: PASS — all 10 tests green.

- [ ] **Step 5: Run the full unit suite, lint, and build**

Run: `npm run test:ci && npx eslint src/server/services/ScoringService.ts src/server/services/ScoringService.test.ts && npm run build`
Expected: tests pass (exit 0), `lint clean` (no output), build exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/ScoringService.ts src/server/services/ScoringService.test.ts
git commit -m "feat(scoring): band-center seeding + symmetric cross-tier refinement (purses-h02)

Rework ScoringService.computePreferences into two order-independent passes:
triage seeds each item at its tier-band center (fixes purses-7lh), pairwise
refines up or down (win +0.1 / loss -0.05, clamped) and may cross any tier
boundary including Release once deltas exceed the 0.125 headroom. Tie = no net
swing but counts as evidence; skip = no-op. Replaces the interim jo2
two-accumulator model.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Verify, open PR, close issues

- [ ] **Step 1: Confirm the working tree is clean and on the feature branch**

Run: `git status -sb`
Expected: branch `feat/sort-ranking-model`, nothing uncommitted.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/sort-ranking-model
gh pr create --title "feat(scoring): rework sort ranking model — band-center tiers + pairwise refinement (purses-h02)" --body "Implements docs/plans/2026-06-09-sort-ranking-model-design.md. Closes purses-h02; resolves purses-7lh. Unblocks purses-o93."
```

Expected: the pre-push hook runs lint + unit tests + build and passes; PR URL printed.

- [ ] **Step 3: After merge, close the beads**

```bash
bd close purses-h02
bd close purses-7lh
```

Expected: both issues closed. (Do not close before the PR merges.)

---

## Self-Review

- **Spec coverage:** band-center seeds (Step 1/3 round-trip test + `TIER_SEED`), pairwise deltas (Steps 1/3), symmetric cross-tier override incl. Release (promote/demote/rescue/demote-into-Release tests), tie no-swing (tie test), skip no-op (skip test), confidence excl. skip (confidence test), un-triaged default (default test), order-independent two passes (implementation). 7lh resolved by seeds. Every spec section maps to a step.
- **Placeholder scan:** none — full test file and full implementation are inline.
- **Type consistency:** constructor arg order `(decisionRepo, sessionRepo)` matches the existing class and the test's `new ScoringService(decisionRepo, sessionRepo)`. `TriageResult`/`PairwiseResult`/`DecisionEvent`/`Session` imported from `@/types` as used by the repositories. `rankBucket`/`score`/`confidence`/`comparisonCount` match `CollectionPreferenceItem`.
