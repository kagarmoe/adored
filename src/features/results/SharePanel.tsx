"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import type { SortResultShare } from "@/types";
import Link from "next/link";

interface SharePanelProps {
  resultId: string;
  initialShares: SortResultShare[];
}

export function SharePanel({ resultId, initialShares }: SharePanelProps) {
  const [shares, setShares] = useState(initialShares);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateShare = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sort-results/${resultId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error("Failed to create share link");
      }

      const newShare = await response.json();
      setShares((prev) => [...prev, newShare]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share link");
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    if (!confirm("Revoke this share link?")) return;

    try {
      const response = await fetch(`/api/sort-results/${resultId}/shares/${shareId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to revoke share");
      }

      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke share");
    }
  };

  const getShareUrl = (token: string) => {
    return `${typeof window !== "undefined" ? window.location.origin : ""}/shared-results/${token}`;
  };

  return (
    <div className="space-y-4">
      {error && (
        <Card padding="md" className="bg-red-50 border border-red-200">
          <p className="text-red-700 text-sm">{error}</p>
        </Card>
      )}

      <Card padding="lg">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Share this result</h3>
              <p className="text-sm text-gray-600 mt-1">
                Create a shareable link for anyone to view this result without logging in.
              </p>
            </div>
            <Button onClick={handleCreateShare} disabled={loading}>
              {loading ? "Creating..." : "Create Link"}
            </Button>
          </div>

          {shares.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-gray-200">
              {shares.map((share) => (
                <div key={share.id} className="flex flex-col gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600">Share Link:</p>
                    <Input
                      type="text"
                      readOnly
                      value={getShareUrl(share.shareToken)}
                      className="text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        navigator.clipboard.writeText(getShareUrl(share.shareToken));
                      }}
                    >
                      Copy
                    </Button>
                    <Link href={getShareUrl(share.shareToken)} target="_blank">
                      <Button size="sm" variant="secondary">
                        Preview
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleRevokeShare(share.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                  {share.expiresAt && (
                    <p className="text-xs text-gray-500">
                      Expires: {new Date(share.expiresAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {shares.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              No active share links yet
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
