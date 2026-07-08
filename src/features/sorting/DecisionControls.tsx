"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// Generic over the decision shape D (type-level only; runtime is unchanged) so a
// local caller's narrowed decision type flows to onDecision instead of being
// erased to Record<string, unknown>. Defaults to Record<string, unknown> for the
// session path, which never reads the decision's fields.
export type DecisionSubmit<D = Record<string, unknown>> =
  | { kind: "session"; sessionId: string; onDecisionMade?: () => void }
  | { kind: "local"; onDecision: (decision: D) => void };

interface DecisionControlsProps<D extends Record<string, unknown> = Record<string, unknown>> {
  submit: DecisionSubmit<D>;
  type: "triage" | "pairwise_compare";
  decisions: Array<{ label: string; decision: D }>;
  /**
   * A decision label already standing for this item (undo-as-revisit, F19):
   * that tier renders as currently selected (`aria-pressed` + a visible ring);
   * the caller renders the "You placed this with … — change it?" line. Absent =
   * today's fresh rendering, pixel-identical.
   */
  priorAnswer?: string;
}

export function DecisionControls<D extends Record<string, unknown> = Record<string, unknown>>({
  submit,
  type,
  decisions,
  priorAnswer,
}: DecisionControlsProps<D>) {
  const router = useRouter();
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitDecision(label: string, decision: D) {
    if (submit.kind === "local") {
      submit.onDecision(decision); // synchronous demo path: no fetch, no pending, no refresh
      return;
    }

    setPendingLabel(label);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${submit.sessionId}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, decision }),
      });

      if (!response.ok) {
        throw new Error("Failed to save decision");
      }

      // Re-enable the tiers before advancing: the triage page reuses this client
      // instance across the soft router.refresh(), so a lingering pendingLabel
      // would keep every tier disabled and block triaging the next item (U2).
      setPendingLabel(null);

      if (submit.onDecisionMade) {
        submit.onDecisionMade();
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save decision");
      setPendingLabel(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {decisions.map((item) => {
          const selected = priorAnswer !== undefined && item.label === priorAnswer;
          return (
            <Button
              key={item.label}
              type="button"
              variant="primary"
              size="lg"
              disabled={pendingLabel !== null}
              onClick={() => submitDecision(item.label, item.decision)}
              aria-pressed={selected || undefined}
              className={`flex-1 min-w-24${selected ? " ring-2 ring-offset-2 ring-primary" : ""}`}
            >
              {pendingLabel === item.label ? "Saving..." : item.label}
            </Button>
          );
        })}
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
