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
      <h3 className="font-semibold text-gray-900">Session Analytics</h3>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card padding="md" className="bg-blue-50 border-blue-200">
          <p className="text-xs font-medium text-blue-700">Decisions Made</p>
          <p className="text-2xl font-bold text-blue-900 mt-2">{totalDecisions}</p>
          <p className="text-xs text-blue-600 mt-1">{triageCount} triage, {pairwiseCount} compare</p>
        </Card>

        <Card padding="md" className="bg-green-50 border-green-200">
          <p className="text-xs font-medium text-green-700">Items Triaged</p>
          <p className="text-2xl font-bold text-green-900 mt-2">{triaged}</p>
          <p className="text-xs text-green-600 mt-1">of {totalItems} items</p>
        </Card>

        <Card padding="md" className="bg-purple-50 border-purple-200">
          <p className="text-xs font-medium text-purple-700">Avg Confidence</p>
          <p className="text-2xl font-bold text-purple-900 mt-2">
            {(avgConfidence * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-purple-600 mt-1">across items</p>
        </Card>

        <Card padding="md" className="bg-orange-50 border-orange-200">
          <p className="text-xs font-medium text-orange-700">Time Spent</p>
          <p className="text-2xl font-bold text-orange-900 mt-2">{timeSpent}m</p>
          <p className="text-xs text-orange-600 mt-1">in session</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card padding="lg">
          <h4 className="font-medium text-gray-900 mb-4">Distribution</h4>
          <div className="space-y-3">
            {[
              { label: "Love", count: bucketCounts.top, color: "bg-red-500" },
              { label: "Like", count: bucketCounts.high, color: "bg-blue-500" },
              { label: "Maybe", count: bucketCounts.medium, color: "bg-yellow-500" },
              { label: "Release", count: bucketCounts.low, color: "bg-gray-500" },
            ].map((bucket) => (
              <div key={bucket.label}>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-sm font-medium text-gray-700">{bucket.label}</p>
                  <p className="text-sm text-gray-600">{bucket.count}</p>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
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
          <h4 className="font-medium text-gray-900 mb-4">Insights</h4>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-start">
              <span className="text-gray-600">Avg Comparisons per Item</span>
              <span className="font-semibold text-gray-900">
                {avgComparisonCount.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-gray-600">Decision Rate</span>
              <span className="font-semibold text-gray-900">
                {timeSpent > 0 ? (totalDecisions / (timeSpent || 1)).toFixed(1) : 0} per min
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-gray-600">Coverage</span>
              <span className="font-semibold text-gray-900">
                {totalItems > 0 ? ((triaged / totalItems) * 100).toFixed(0) : 0}%
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-gray-600">Confidence Level</span>
              <span className={`font-semibold ${
                avgConfidence > 0.8 ? "text-green-600" :
                avgConfidence > 0.6 ? "text-yellow-600" :
                "text-orange-600"
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
