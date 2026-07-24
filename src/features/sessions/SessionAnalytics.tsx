"use client";

import { Card } from "@/components/ui";
import type { CollectionPreferenceItem, DecisionEvent } from "@/types";
import { effectiveBucket } from "@/lib/results-buckets";

interface SessionAnalyticsProps {
  preferences: CollectionPreferenceItem[];
  decisions: DecisionEvent[];
  totalItems: number;
  sessionCreatedAt: Date;
}

/**
 * A gentle reflection on the sort so far — NOT a metrics panel (TONE.md). No
 * coverage %, no decision-rate-per-minute, no "N of M" denominators, no per-tier
 * count tally: those framings measure the person against a ceiling. Instead we
 * affirm the tiers they've discovered and note, softly, whether the top tier is
 * still being refined. `totalItems` / `sessionCreatedAt` are retained in the props
 * for callers but deliberately not rendered as tallies.
 */
export function SessionAnalytics({ preferences, decisions }: SessionAnalyticsProps) {
  const hasWork = preferences.length > 0 || decisions.length > 0;

  // A hand-set bin wins the chip it lights, same as the Standing (purses-xxo7).
  const bucketOf = (p: CollectionPreferenceItem) =>
    effectiveBucket({ manualBucket: p.manualBucket, computedBucket: p.rankBucket });
  const tiers = [
    { label: "Love", present: preferences.some((p) => bucketOf(p) === "top") },
    { label: "Like", present: preferences.some((p) => bucketOf(p) === "high") },
    { label: "Maybe", present: preferences.some((p) => bucketOf(p) === "medium") },
    { label: "Onward", present: preferences.some((p) => bucketOf(p) === "low") },
  ];
  const discovered = tiers.filter((t) => t.present);

  if (!hasWork) {
    return (
      <div className="space-y-2">
        <h3 className="text-ink">Where things stand</h3>
        <p className="text-sm text-ink-soft">
          Nothing sorted just yet — start whenever you feel like it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-ink">Where things stand</h3>

      <Card padding="lg">
        <p className="text-sm text-ink">
          You&apos;ve been getting to know these pieces
          {discovered.length > 0 ? " and giving each a feeling." : "."}
        </p>
        {discovered.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {discovered.map((tier) => (
              <span
                key={tier.label}
                className="rounded-control bg-content-soft px-3 py-1 text-sm text-ink"
              >
                {tier.label}
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
