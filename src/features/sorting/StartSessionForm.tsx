"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import { setRoundBox, DEFAULT_ROUND_BOX, type RoundBoxSeconds } from "@/lib/round-preference";
import { TimerDial } from "./TimerDial";

// Quiet helper lines under the Round length control, keyed to the selection (TONE).
export const TIMED_BOX_HELPER = "A short round — it wraps up gently.";
export const NO_TIMER_HELPER = "Take all the time you like.";

interface StartSessionFormProps {
  collectionId: string;
  collectionSlug: string;
}

export function StartSessionForm({ collectionId, collectionSlug }: StartSessionFormProps) {
  const router = useRouter();
  const [goal, setGoal] = useState("Discover favorites");
  const [scope, setScope] = useState("all");
  // Default to the shared gentle round box (round-preference.ts is the one home);
  // "No timer" is a first-class peer, never buried. Persisted device-locally, never to the DB.
  const [timebox, setTimebox] = useState<RoundBoxSeconds>(DEFAULT_ROUND_BOX);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseTimebox(box: RoundBoxSeconds) {
    setTimebox(box);
    setRoundBox(box); // no running clock at start — persist immediately
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionId, goal, scope }),
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
            <div className="flex flex-col items-center gap-3">
              <label className="mb-2 block text-sm font-medium text-ink">Round length</label>
              <TimerDial value={timebox} onChange={chooseTimebox} size={200} discClassName="bg-surface" />
              <p className="text-sm text-ink-soft">{timebox === "none" ? NO_TIMER_HELPER : TIMED_BOX_HELPER}</p>
            </div>
          </div>
        </div>
      </Card>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex">
        <Button
          type="submit"
          disabled={isSubmitting}
          aria-label={isSubmitting ? "Starting" : "Start session"}
          className="w-full sm:w-auto"
        >
          {isSubmitting ? (
            "Starting..."
          ) : (
            <>
              <span className="sm:hidden">Start</span>
              <span className="hidden sm:inline">Start session</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
