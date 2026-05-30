"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

interface DecisionControlsProps {
  sessionId: string;
  type: "triage" | "pairwise_compare";
  decisions: Array<{ label: string; decision: Record<string, unknown> }>;
}

export function DecisionControls({ sessionId, type, decisions }: DecisionControlsProps) {
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submitDecision(label: string, decision: Record<string, unknown>) {
    setPendingLabel(label);
    setMessage(null);

    const response = await fetch(`/api/sessions/${sessionId}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, decision }),
    });

    setPendingLabel(null);
    setMessage(response.ok ? "Saved" : "Unable to save decision");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {decisions.map((item) => (
          <Button
            key={item.label}
            type="button"
            variant="secondary"
            disabled={pendingLabel !== null}
            onClick={() => submitDecision(item.label, item.decision)}
          >
            {pendingLabel === item.label ? "Saving..." : item.label}
          </Button>
        ))}
      </div>
      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );
}
