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
      <h3 className="text-ink">Session Analytics</h3>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card padding="md" className="bg-verdigris-soft border-line">
          <p className="text-xs font-medium text-verdigris-deep">Decisions Made</p>
          <p className="text-2xl font-bold text-verdigris-deep mt-2">{totalDecisions}</p>
          <p className="text-xs text-verdigris-deep mt-1">{triageCount} triage, {pairwiseCount} compare</p>
        </Card>

        <Card padding="md" className="bg-success-soft border-success-soft">
          <p className="text-xs font-medium text-success-deep">Items Triaged</p>
          <p className="text-2xl font-bold text-success-deep mt-2">{triaged}</p>
          <p className="text-xs text-success-deep mt-1">of {totalItems} items</p>
        </Card>

        <Card padding="md" className="bg-plaster border-line">
          <p className="text-xs font-medium text-ink-soft">Avg Confidence</p>
          <p className="text-2xl font-bold text-ink mt-2">
            {(avgConfidence * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-ink-soft mt-1">across items</p>
        </Card>

        <Card padding="md" className="bg-warning-soft border-warning-soft">
          <p className="text-xs font-medium text-warning-deep">Time Spent</p>
          <p className="text-2xl font-bold text-warning-deep mt-2">{timeSpent}m</p>
          <p className="text-xs text-warning-deep mt-1">in session</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card padding="lg">
          <h4 className="text-ink mb-4">Distribution</h4>
          <div className="space-y-3">
            {[
              { label: "Love", count: bucketCounts.top, color: "bg-verdigris" },
              { label: "Like", count: bucketCounts.high, color: "bg-clay" },
              { label: "Maybe", count: bucketCounts.medium, color: "bg-warning" },
              { label: "Release", count: bucketCounts.low, color: "bg-ink-soft" },
            ].map((bucket) => (
              <div key={bucket.label}>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-sm font-medium text-ink">{bucket.label}</p>
                  <p className="text-sm text-ink-soft">{bucket.count}</p>
                </div>
                <div className="h-2 bg-clay-soft rounded-full overflow-hidden">
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
              <span className="text-ink-soft">Avg Comparisons per Item</span>
              <span className="font-semibold text-ink">
                {avgComparisonCount.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-ink-soft">Decision Rate</span>
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
              <span className="text-ink-soft">Confidence Level</span>
              <span className={`font-semibold ${
                avgConfidence > 0.8 ? "text-success-deep" :
                avgConfidence > 0.6 ? "text-warning-deep" :
                "text-error-deep"
              }`}>
                {avgConfidence > 0.8 ? "High" : avgConfidence > 0.6 ? "Medium" : "Low"}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
