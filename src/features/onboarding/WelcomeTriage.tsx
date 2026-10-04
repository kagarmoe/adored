"use client";

import Image from "next/image";
import { DecisionControls } from "@/features/sorting/DecisionControls";
import { DeferControl } from "@/features/sorting/DeferControl";
import { SetAsideButton } from "@/features/sorting/SetAsideButton";
import { ROUND_COPY, WELCOME_ROUND_KICKER, triageDecisions } from "@/features/sorting/roundCopy";
import { RESULT_TO_TIER, TRIAGE_ITEMS, type TriageOutcome } from "./sampleData";

interface WelcomeTriageProps {
  /** Which triage item is on screen. Strictly one at a time — never a grid. */
  index: number;
  /** Reports the typed outcome for this item, then advances the walkthrough. */
  onOutcome: (itemId: string, outcome: TriageOutcome) => void;
}

// Beat 2 — one thing at a time, taught with the REAL sorting controls in their
// synchronous local mode: no fetch, no router, no TriageUndoProvider. A neutral
// kicker (WELCOME_ROUND_KICKER) over the shared explainer from ROUND_COPY.
export function WelcomeTriage({ index, onOutcome }: WelcomeTriageProps) {
  const item = TRIAGE_ITEMS[index];

  return (
    <section className="flex flex-col items-center text-center gap-6">
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm text-ink-soft">{WELCOME_ROUND_KICKER}</p>
        <p className="text-sm text-ink-soft">{ROUND_COPY.triage.explainer}</p>
      </div>

      <h1 className="font-display text-3xl text-ink">How do you feel about this one?</h1>

      <div className="relative w-64 h-64 rounded-card overflow-hidden bg-content-soft shadow-card">
        <Image src={item.imageSrc} alt={item.name} fill className="object-cover" unoptimized />
      </div>
      <p className="text-lg text-ink">{item.name}</p>

      <DecisionControls
        onDecision={(d) =>
          onOutcome(item.id, {
            kind: "tier",
            tier: RESULT_TO_TIER[d.result],
          })
        }
        decisions={triageDecisions(item.id)}
      />

      <div className="w-full border-t border-hairline pt-4 flex flex-col items-center gap-3">
        <div className="flex flex-nowrap justify-center gap-2 sm:gap-3">
          <DeferControl onDecision={() => onOutcome(item.id, { kind: "deferred" })} />
          <SetAsideButton onDecision={() => onOutcome(item.id, { kind: "setAside" })} />
        </div>
      </div>
    </section>
  );
}
