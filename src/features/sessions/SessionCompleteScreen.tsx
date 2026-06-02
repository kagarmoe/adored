"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

interface SessionCompleteScreenProps {
  sessionId: string;
  collectionId: string;
  decisionCount: number;
  bucketCounts: {
    top: number;
    high: number;
    medium: number;
    low: number;
  };
}

export function SessionCompleteScreen({
  sessionId,
  collectionId,
  decisionCount,
  bucketCounts,
}: SessionCompleteScreenProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = bucketCounts.top + bucketCounts.high + bucketCounts.medium + bucketCounts.low;

  const handleGenerateDraft = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/sort-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          collectionId,
          name: `Sort Results - ${new Date().toLocaleDateString()}`,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate results");
      }

      const result = await response.json();
      router.push(`/collections/${collectionId}/results/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate results");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card padding="lg" className="max-w-2xl w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-3xl text-ink">Session Complete!</h2>
          <p className="text-ink-soft">You&apos;ve made great progress organizing your items.</p>
        </div>

        <div className="grid grid-cols-4 gap-3 bg-vellum p-4 rounded-lg">
          <div className="text-center">
            <p className="text-2xl font-bold text-ink">{bucketCounts.top}</p>
            <p className="text-xs text-ink-soft mt-1">Love</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-ink">{bucketCounts.high}</p>
            <p className="text-xs text-ink-soft mt-1">Like</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-ink">{bucketCounts.medium}</p>
            <p className="text-xs text-ink-soft mt-1">Maybe</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-ink">{bucketCounts.low}</p>
            <p className="text-xs text-ink-soft mt-1">Release</p>
          </div>
        </div>

        <div className="text-center text-sm text-ink-soft space-y-1">
          <p className="font-medium">{total} items sorted out of {decisionCount} decisions</p>
          <p>Ready to finalize and share your results?</p>
        </div>

        {error && (
          <div className="bg-error-soft border border-error-soft rounded p-3">
            <p className="text-error-deep text-sm">{error}</p>
          </div>
        )}

        <div className="flex gap-3 flex-col sm:flex-row">
          <Button
            variant="secondary"
            onClick={() => router.push(`/collections/${collectionId}/sort/${sessionId}`)}
            disabled={loading}
            className="flex-1"
          >
            Continue Sorting
          </Button>
          <Button
            onClick={handleGenerateDraft}
            disabled={loading}
            className="flex-1"
          >
            {loading ? "Generating..." : "Generate Results"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
