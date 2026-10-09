"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, LoadingSpinner, ErrorMessage, buttonVariants } from "@/components/ui";
import { apiGet, apiPost } from "@/lib/api-client";
import { useSession } from "@/lib/auth-client";
import type { InvitationPreview } from "@/server/services/InvitationAcceptService";

export default function InvitationPage() {
  // Client component: useParams() reads the dynamic segment from context —
  // no `use(params)` Promise-unwrap needed (that's the server-component
  // convention).
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        const data = await apiGet<InvitationPreview>(`/api/invitations/accept?token=${token}`);
        setPreview(data);
      } catch (err: any) {
        setError(err?.message || "Invitation not found or expired");
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    setError("");

    try {
      const { collectionId } = await apiPost<{ collectionId: string }>(
        `/api/invitations/accept?token=${token}`,
        {},
      );
      router.push(`/collections/${collectionId}`);
    } catch (err: any) {
      setError(err?.message || "Failed to accept invitation");
      setAccepting(false);
    }
  }

  if (loading || sessionPending) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center p-4">
        <div className="max-w-sm w-full">
          <ErrorMessage message={error || "Invalid invitation"} />
        </div>
      </div>
    );
  }

  const signedIn = Boolean(session?.user);

  return (
    <div className="min-h-[100svh] flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-sm w-full bg-glass border border-rim rounded-card shadow-card p-6 sm:p-8">
        <h1 className="text-2xl text-ink mb-2">You&apos;re invited!</h1>

        <div className="bg-content-soft border border-hairline rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-ink">Collection</p>
          <p className="text-lg font-bold text-primary">{preview.collectionName}</p>
          {preview.collectionDescription && (
            <p className="text-xs text-ink-soft mt-2">{preview.collectionDescription}</p>
          )}
        </div>

        <div className="space-y-2 mb-6">
          {preview.inviterName && (
            <p className="text-sm text-ink-soft">
              {preview.inviterName} invited you to help sort this collection.
            </p>
          )}
          <p className="text-sm text-ink-soft">
            You&apos;ll sort it your own way — your choices never overwrite anyone else&apos;s.
          </p>
          <p className="text-sm text-ink-soft">
            You&apos;ll be able to add photos, name things, and sort.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {signedIn ? (
            <Button
              fullWidth
              onClick={handleAccept}
              disabled={accepting}
              aria-label={accepting ? "Accepting" : "Accept invitation"}
            >
              {accepting ? (
                "Accepting..."
              ) : (
                <>
                  <span className="sm:hidden">Accept</span>
                  <span className="hidden sm:inline">Accept invitation</span>
                </>
              )}
            </Button>
          ) : (
            // Styled as a button, but a link is a link — same pattern as
            // SharePanel's "Preview" link (no nested <button> inside <a>).
            <Link
              href={`/login?callbackUrl=/invitations/${token}`}
              className={`${buttonVariants({ variant: "primary" })} w-full`}
            >
              Sign in to accept
            </Link>
          )}
          <Button variant="secondary" fullWidth onClick={() => router.push("/")}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
