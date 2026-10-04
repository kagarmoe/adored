"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

// Generic over the decision shape D so a caller's narrowed decision type reaches onDecision.
interface DecisionControlsProps<D extends Record<string, unknown> = Record<string, unknown>> {
  /** Records the answer. Return false (or a promise of it) when it did not hold, so "saved" is never said too early. */
  onDecision: (decision: D) => void | boolean | Promise<void | boolean>;
  decisions: Array<{ label: string; decision: D }>;
  /**
   * A decision label already standing for this item (undo-as-revisit, F19): that tier renders
   * as currently selected (`aria-pressed` + a visible ring); the caller renders the
   * "You placed this with … — change it?" line.
   */
  priorAnswer?: string;
}

export function DecisionControls<D extends Record<string, unknown> = Record<string, unknown>>({
  onDecision,
  decisions,
  priorAnswer,
}: DecisionControlsProps<D>) {
  // Mounted (empty) on first render so the region exists BEFORE its text ever
  // changes — a live region that appears with its content is not announced.
  const [announcement, setAnnouncement] = useState("");

  // The item advances silently under a screen-reader user otherwise (SC 4.1.3).
  // Triage runs Love, Love, Love — identical text does NOT re-fire a live region,
  // so nudge the string (a trailing space is not spoken).
  function announce(label: string) {
    const line = `${label} — saved.`;
    setAnnouncement((prev) => (prev === line ? `${line} ` : line));
  }

  async function submitDecision(label: string, decision: D) {
    if ((await onDecision(decision)) !== false) announce(label);
  }

  return (
    <div className="space-y-3">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {decisions.map((item) => {
          const selected = priorAnswer !== undefined && item.label === priorAnswer;
          return (
            <Button
              key={item.label}
              type="button"
              variant="primary"
              size="lg"
              onClick={() => submitDecision(item.label, item.decision)}
              aria-pressed={selected || undefined}
              className={`flex-1 min-w-24${selected ? " ring-2 ring-offset-2 ring-offset-ground ring-primary" : ""}`}
            >
              {item.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
