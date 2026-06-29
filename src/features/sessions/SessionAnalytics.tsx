"use client";

import { Card } from "@/components/ui";
import type { CollectionPreferenceItem, DecisionEvent } from "@/types";

interface SessionAnalyticsProps {
  preferences: CollectionPreferenceItem[];
  decisions: DecisionEvent[];
  totalItems: number;
  sessionCreatedAt: Date;
}

export function SessionAnalytics({
  preferences,
  decisions,
  totalItems,
  sessionCreatedAt,
}: SessionAnalyticsProps) {
  const triageDecisions = decisions.filter((d) => d.type === "triage");
  const pairwiseDecisions = decisions.filter((d) => d.type === "pairwise_compare");

  const triageCount = triageDecisions.length;
  const pairwiseCount = pairwiseDecisions.length;
  const totalDecisions = decisions.length;

  const triaged = preferences.length;
  const avgConfidence = preferences.length > 0
    ? preferences.reduce((sum, p) => sum + p.confidence, 0) / preferences.length
    : 0;

  const bucketCounts = {
    top: preferences.filter((p) => p.rankBucket === "top").length,
    high: preferences.filter((p) => p.rankBucket === "high").length,
    medium: preferences.filter((p) => p.rankBucket === "medium").length,
    low: preferences.filter((p) => p.rankBucket === "low").length,
  };

  const avgComparisonCount =
    preferences.length > 0
      ? preferences.reduce((sum, p) => sum + p.comparisonCount, 0) / preferences.length
      : 0;

  const timeSpent = Math.round(
    (new Date().getTime() - new Date(sessionCreatedAt).getTime()) / 60000
  );

  return (
    <div className="space-y-4">
      <h3 className="text-ink">Session analytics</h3>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card padding="md" className="bg-surface border-hairline">
          <p className="text-xs font-medium text-ink-soft">Decisions made</p>
          <p className="text-2xl font-bold text-ink mt-2">{totalDecisions}</p>
          <p className="text-xs text-ink-soft mt-1">{triageCount} triage, {pairwiseCount} compare</p>
        </Card>

        <Card padding="md" className="bg-surface border-hairline">
          <p className="text-xs font-medium text-ink-soft">Items triaged</p>
          <p className="text-2xl font-bold text-ink mt-2">{triaged}</p>
          <p className="text-xs text-ink-soft mt-1">of {totalItems} items</p>
        </Card>

        <Card padding="md" className="bg-surface border-hairline">
          <p className="text-xs font-medium text-ink-soft">Avg confidence</p>
          <p className="text-2xl font-bold text-ink mt-2">
            {(avgConfidence * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-ink-soft mt-1">across items</p>
        </Card>

        <Card padding="md" className="bg-surface border-hairline">
          <p className="text-xs font-medium text-ink-soft">Time spent</p>
          <p className="text-2xl font-bold text-ink mt-2">{timeSpent}m</p>
          <p className="text-xs text-ink-soft mt-1">in session</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card padding="lg">
          <h4 className="text-ink mb-4">Distribution</h4>
          <div className="space-y-3">
            {[
              { label: "Love", count: bucketCounts.top, color: "bg-tier-love" },
              { label: "Like", count: bucketCounts.high, color: "bg-tier-like" },
              { label: "Maybe", count: bucketCounts.medium, color: "bg-tier-maybe" },
              { label: "Onward", count: bucketCounts.low, color: "bg-tier-onward" },
            ].map((bucket) => (
              <div key={bucket.label}>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-sm font-medium text-ink">{bucket.label}</p>
                  <p className="text-sm text-ink-soft">{bucket.count}</p>
                </div>
                <div className="h-2 bg-content-soft rounded-full overflow-hidden">
                  <div
                    className={`${bucket.color} h-full`}
                    style={{
                      width: `${triaged > 0 ? (bucket.count / triaged) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card padding="lg">
          <h4 className="text-ink mb-4">Insights</h4>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-start">
              <span className="text-ink-soft">Avg comparisons per item</span>
              <span className="font-semibold text-ink">
                {avgComparisonCount.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-ink-soft">Decision rate</span>
              <span className="font-semibold text-ink">
                {timeSpent > 0 ? (totalDecisions / (timeSpent || 1)).toFixed(1) : 0} per min
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-ink-soft">Coverage</span>
              <span className="font-semibold text-ink">
                {totalItems > 0 ? ((triaged / totalItems) * 100).toFixed(0) : 0}%
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-ink-soft">Confidence level</span>
              <span className="font-semibold text-ink">
                {avgConfidence > 0.8 ? "High" : avgConfidence > 0.6 ? "Medium" : "Low"}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
