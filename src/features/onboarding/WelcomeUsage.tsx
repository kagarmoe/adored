"use client";

import Image from "next/image";
import { Button } from "@/components/ui";
import { DecisionControls } from "@/features/sorting/DecisionControls";
import {
  ROUND_COPY,
  USAGE_PASS_ARIA_LABEL,
  USAGE_PASS_LABEL,
  USAGE_PASS_TITLE,
  WELCOME_ROUND_KICKER,
  usageDecisions,
} from "@/features/sorting/roundCopy";
import { type SampleItem, type UsageOutcome } from "./sampleData";

interface WelcomeUsageProps {
  item: SampleItem;
  /** Reports the typed usage outcome, then advances the walkthrough. */
  onOutcome: (outcome: UsageOutcome) => void;
}

// Beat 3 — "Do you use this?", taught with the REAL usage decisions in their
// synchronous local mode: no fetch, no router, no optimistic round machinery. The
// kicker uses the NEUTRAL round noun (WELCOME_ROUND_KICKER) distinct from the
// person-side arc names in ROUND_COPY (user decision); the explainer still comes
// from ROUND_COPY. A single tap — Yes, Not these days, or Skip for now — teaches
// the beat and advances to Compare.
export function WelcomeUsage({ item, onOutcome }: WelcomeUsageProps) {
  return (
    <section className="flex flex-col items-center text-center gap-6">
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm text-ink-soft">{WELCOME_ROUND_KICKER}</p>
        <p className="text-sm text-ink-soft">{ROUND_COPY.usage.explainer}</p>
      </div>

      <h1 className="font-display text-3xl text-ink">{ROUND_COPY.usage.name}</h1>

      <div className="relative w-64 h-64 rounded-card overflow-hidden bg-content-soft shadow-card">
        <Image src={item.imageSrc} alt={item.name} fill className="object-cover" unoptimized />
      </div>
      <p className="text-lg text-ink">{item.name}</p>

      <DecisionControls
        submit={{
          kind: "local",
          onDecision: (d) =>
            onOutcome(d.result === "uses" ? { kind: "used" } : { kind: "unused" }),
        }}
        type="usage"
        decisions={usageDecisions(item.id)}
      />

      {/* The demoted-escape slot: a write-nothing pass that still advances the
          teaching beat. Its contract lives in the accessible name (WCAG 2.5.3 —
          the accessible name begins with the visible label). Distinct from the
          shell's own "Leave tutorial" exit, which leaves the walkthrough entirely. */}
      <div className="w-full border-t border-hairline pt-4 flex flex-col items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onOutcome({ kind: "pass" })}
          title={USAGE_PASS_TITLE}
          aria-label={USAGE_PASS_ARIA_LABEL}
        >
          {USAGE_PASS_LABEL}
        </Button>
      </div>
    </section>
  );
}
