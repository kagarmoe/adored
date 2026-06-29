"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";

interface StartSessionFormProps {
  collectionId: string;
  collectionSlug: string;
}

export function StartSessionForm({ collectionId, collectionSlug }: StartSessionFormProps) {
  const router = useRouter();
  const [goal, setGoal] = useState("Discover favorites");
  const [scope, setScope] = useState("all");
  const [timebox, setTimebox] = useState("15");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
              <label className="mb-2 block text-sm font-medium text-ink">Timebox</label>
              <Select
                value={timebox}
                onChange={(event) => setTimebox(event.target.value)}
                options={[
                  { value: "10", label: "10 minutes" },
                  { value: "15", label: "15 minutes" },
                  { value: "30", label: "30 minutes" },
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
