"use client";

import { CompareChoice } from "@/features/sorting/CompareChoice";
import { COMPARE_SUBLINE, ROUND_COPY } from "@/features/sorting/roundCopy";
import { COMPARE_PAIR, toItem, type CompareOutcome } from "./sampleData";

interface WelcomeCompareProps {
  /** Reports the typed compare outcome, then advances the walkthrough. */
  onOutcome: (outcome: CompareOutcome) => void;
}

// Beat 3 — two of YOUR things side by side, taught with the REAL CompareChoice
// in its synchronous local mode: no fetch, no router, no posthog. The kicker
// reuses the hub's exact taught noun ("A Compare round") so the two surfaces
// cannot fork — never two product cards to buy.
export function WelcomeCompare({ onOutcome }: WelcomeCompareProps) {
  const [left, right] = COMPARE_PAIR;

  return (
    <section className="flex flex-col items-center text-center gap-6">
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm text-ink-soft">A {ROUND_COPY.compare.name} round</p>
        <p className="text-sm text-ink-soft">{ROUND_COPY.compare.explainer}</p>
      </div>

      <h2 className="font-display text-3xl text-ink">Which do you love more?</h2>

      <p className="text-sm text-ink-soft">{COMPARE_SUBLINE}</p>

      <div className="w-full max-w-xl">
        <CompareChoice
          submit={{
            kind: "local",
            onDecision: (result) =>
              onOutcome(
                result === "item_a"
                  ? { kind: "win", winnerId: left.id }
                  : result === "item_b"
                    ? { kind: "win", winnerId: right.id }
                    : { kind: result },
              ),
          }}
          itemA={toItem(left)}
          itemB={toItem(right)}
          heroA={left.imageSrc}
          heroB={right.imageSrc}
          comparisonsMade={0}
        />
      </div>
    </section>
  );
}
