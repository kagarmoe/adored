"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

interface FinalizeEntryProps {
  collectionId: string;
  collectionSlug: string;
}

/**
 * The Standing's calm "Finalize" entry. It reuses the EXISTING flow unchanged
 * (Task 5a does not touch finalize semantics): POST /api/sort-results
 * materializes the current live preferences into a draft, then we route to that
 * draft's finalize page. Reversible, nothing-lost on failure.
 */
export function FinalizeEntry({ collectionId, collectionSlug }: FinalizeEntryProps) {
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
      router.push(`/collections/${collectionSlug}/results/${result.number}/finalize`);
    } catch {
      setError("That didn't come together just now. Nothing was lost — try again whenever you like.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="secondary" onClick={handleClick} disabled={loading}>
        {loading ? "Getting ready…" : "Finalize"}
      </Button>
      {error && (
        <p className="text-sm text-ink-soft" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
