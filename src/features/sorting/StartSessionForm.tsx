"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import { setRoundBox, type RoundBox } from "@/lib/round-preference";

interface StartSessionFormProps {
  collectionId: string;
  collectionSlug: string;
}

export function StartSessionForm({ collectionId, collectionSlug }: StartSessionFormProps) {
  const router = useRouter();
  const [goal, setGoal] = useState("Discover favorites");
  const [scope, setScope] = useState("all");
  // Default to a gentle 10-minute round box so the timer is actually experienced;
  // "No timer" is one tap away (a11y 2.2.1). Persisted device-locally, never to the DB.
  const [timebox, setTimebox] = useState("10");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseTimebox(value: string) {
    setTimebox(value);
    const box: RoundBox = value === "none" ? "none" : (Number(value) as RoundBox);
    setRoundBox(box);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId, goal, scope, timebox }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error || "Unable to start session");
      setIsSubmitting(false);
      return;
    }

    const newSession = await response.json();
    router.push(`/collections/${collectionSlug}/sort/${newSession.number}/triage`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card padding="lg">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">Goal</label>
            <Input value={goal} onChange={(event) => setGoal(event.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">Scope</label>
              <Select
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                options={[
                  { value: "all", label: "All items" },
                  { value: "unranked", label: "Unranked items" },
                  { value: "favorites", label: "Favorites refresh" },
                ]}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">Round length</label>
              <Select
                aria-label="Round length"
                value={timebox}
                onChange={(event) => chooseTimebox(event.target.value)}
                options={[
                  { value: "5", label: "5 minutes" },
                  { value: "10", label: "10 minutes" },
                  { value: "20", label: "20 minutes" },
                  { value: "none", label: "No timer" },
                ]}
              />
            </div>
          </div>
        </div>
      </Card>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Starting..." : "Start session"}
        </Button>
      </div>
    </form>
  );
}
