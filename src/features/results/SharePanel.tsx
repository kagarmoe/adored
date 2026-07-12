"use client";

import { useState } from "react";
import { Button, buttonVariants, Card, Input } from "@/components/ui";
import type { SortResultShare } from "@/types";
import Link from "next/link";

interface SharePanelProps {
  resultId: string;
  initialShares: SortResultShare[];
}

// The API's `error` field is developer-facing (see src/server/api/http-errors.ts);
// what the person reads is these, in their own voice.
const CREATE_FAILED = "That link didn't come together just now. Nothing changed — try again whenever you like.";
const REVOKE_FAILED = "That link is still shared — we couldn't put it away just now. Try again in a moment.";

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
        setError(CREATE_FAILED);
        return;
      }

      const newShare = await response.json();
      setShares((prev) => [...prev, newShare]);
    } catch {
      setError(CREATE_FAILED);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    if (!confirm("Stop sharing this link?")) return;
    setError(null);

    try {
      const response = await fetch(`/api/sort-results/${resultId}/shares/${shareId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError(REVOKE_FAILED);
        return;
      }

      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch {
      setError(REVOKE_FAILED);
    }
  };

  const getShareUrl = (token: string) => {
    return `${typeof window !== "undefined" ? window.location.origin : ""}/shared-results/${token}`;
  };

  return (
    <div className="space-y-4">
      {error && (
        <Card padding="md" className="bg-error-soft border border-error-soft">
          <p className="text-error-deep text-sm">{error}</p>
        </Card>
      )}

      <Card padding="lg">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-ink">Share this result</h3>
              <p className="text-sm text-ink-soft mt-1">
                Create a shareable link for anyone to view this result without logging in.
              </p>
            </div>
            <Button onClick={handleCreateShare} disabled={loading}>
              {loading ? "Creating..." : "Create link"}
            </Button>
          </div>

          {shares.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-hairline">
              {shares.map((share) => (
                <div key={share.id} className="flex flex-col gap-3 p-3 bg-ground rounded-lg">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-ink-soft">Share link:</p>
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
                    {/* Styled as a button, but a link is a link: a <button> inside
                        an <a> is a duplicate tab stop with an ambiguous role. */}
                    <Link
                      href={getShareUrl(share.shareToken)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ size: "sm", variant: "secondary" })}
                    >
                      Preview
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
                    <p className="text-xs text-ink-soft">
                      Expires: {new Date(share.expiresAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {shares.length === 0 && (
            <p className="text-sm text-ink-soft text-center py-4">
              No active share links yet
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
