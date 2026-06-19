"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

interface DecisionControlsProps {
  sessionId: string;
  type: "triage" | "pairwise_compare";
  decisions: Array<{ label: string; decision: Record<string, unknown> }>;
  onDecisionMade?: () => void;
}

export function DecisionControls({
  sessionId,
  type,
  decisions,
  onDecisionMade,
}: DecisionControlsProps) {
  const router = useRouter();
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitDecision(label: string, decision: Record<string, unknown>) {
    setPendingLabel(label);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/decisions`, {
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

      if (onDecisionMade) {
        onDecisionMade();
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
        {decisions.map((item) => (
          <Button
            key={item.label}
            type="button"
            variant="primary"
            size="lg"
            disabled={pendingLabel !== null}
            onClick={() => submitDecision(item.label, item.decision)}
            className="flex-1 min-w-24"
          >
            {pendingLabel === item.label ? "Saving..." : item.label}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
    </div>
  );
}
