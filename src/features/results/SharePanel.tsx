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
const UNDO_FAILED = "That link is still stopped — we couldn't bring it back just now. Try again in a moment.";

export function SharePanel({ resultId, initialShares }: SharePanelProps) {
  const [shares, setShares] = useState(initialShares);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The share we just stopped, kept so Undo can restore it. Persistent, never on a
  // timer: a countdown would be exactly the pressure TONE forbids.
  const [stopped, setStopped] = useState<SortResultShare | null>(null);

  const setStatus = (shareId: string, status: SortResultShare["status"]) =>
    setShares((prev) => prev.map((s) => (s.id === shareId ? { ...s, status } : s)));

  // Revoking is a soft status flip, so the token survives — Undo restores the very link
  // the person already sent, not a new one. Hence no "are you sure?": the action is
  // reversible, and a modal bracing for a mistake is not this app's voice.
  const handleStopSharing = async (shareId: string) => {
    setError(null);
    setStatus(shareId, "revoked");

    try {
      const response = await fetch(`/api/sort-results/${resultId}/shares/${shareId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setStatus(shareId, "active");
        setError(REVOKE_FAILED);
        return;
      }

      setStopped(shares.find((s) => s.id === shareId) ?? null);
    } catch {
      setStatus(shareId, "active");
      setError(REVOKE_FAILED);
    }
  };

  const handleUndoStop = async (shareId: string) => {
    setError(null);

    try {
      const response = await fetch(`/api/sort-results/${resultId}/shares/${shareId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });

      if (!response.ok) {
        setError(UNDO_FAILED);
        return;
      }

      setStatus(shareId, "active");
      setStopped(null);
    } catch {
      setError(UNDO_FAILED);
    }
  };

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

  const getShareUrl = (token: string) => {
    return `${typeof window !== "undefined" ? window.location.origin : ""}/shared-results/${token}`;
  };

  // The server hands us every share for this result, revoked ones included. A revoked
  // link is dead (viewSharedResult rejects a non-active status), so showing it with
  // Copy/Preview would offer a link that 404s whoever it was sent to.
  const activeShares = shares.filter((s) => s.status === "active");

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
              <h3 className="text-ink">Show someone what you love</h3>
              <p className="text-sm text-ink-soft mt-1">
                A link they can open straight away — no account, no signing in.
              </p>
            </div>
            <Button onClick={handleCreateShare} disabled={loading}>
              {loading ? "Creating..." : "Create link"}
            </Button>
          </div>

          {stopped && (
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-hairline">
              <p className="text-sm text-ink-soft">That link is no longer shared.</p>
              <Button size="sm" variant="secondary" onClick={() => handleUndoStop(stopped.id)}>
                Undo
              </Button>
            </div>
          )}

          {activeShares.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-hairline">
              {activeShares.map((share) => (
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
                      onClick={() => handleStopSharing(share.id)}
                    >
                      Stop sharing
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

          {activeShares.length === 0 && !stopped && (
            <p className="text-sm text-ink-soft text-center py-4">
              Nothing shared yet — whenever you&apos;d like to, make a link.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
