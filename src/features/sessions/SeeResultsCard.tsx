"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

interface SeeResultsCardProps {
  collectionId: string;
  collectionSlug: string;
  // How many items the person has placed so far. Part of the trigger's contract
  // (the parent only mounts the card when this is > 0); the copy stays
  // count-free on purpose — affirming, never a tally — so it isn't surfaced.
  bucketed: number;
}

// The reachable affordance that gathers what the person has chosen into one
// place. Tap-only, reversible, nothing-lost on failure — the trigger creates a
// populated draft result (POST /api/sort-results materializes the ranked items
// from the curator's preferences) and navigates to it.
export function SeeResultsCard({ collectionId, collectionSlug }: SeeResultsCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/sort-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId, name: "Draft result" }),
      });
      if (!response.ok) {
        throw new Error("create failed");
      }
      const result = await response.json();
      router.push(`/collections/${collectionSlug}/results/${result.number}`);
    } catch {
      // Soft, person's-side, reversible: nothing was lost, retry whenever.
      setError("That didn't come together just now. Nothing was lost — try again whenever you like.");
      setLoading(false);
    }
  }

  return (
    <Card padding="lg" className="border-hairline bg-accent-aqua">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg text-ink">See what you love most</h2>
          <p className="mt-1 text-sm text-ink">
            Whenever you&apos;re ready, gather what you&apos;ve chosen so far into one place.
          </p>
        </div>
        <Button type="button" onClick={handleClick} disabled={loading}>
          {loading ? "Gathering…" : "Show me what I love"}
        </Button>
      </div>
      {error && (
        <p className="mt-3 text-sm text-ink-soft" role="status">
          {error}
        </p>
      )}
    </Card>
  );
}
