"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LoadingSpinner, ErrorMessage } from "@/components/ui";
import { apiGet, apiPost } from "@/lib/api-client";
import type { Invitation, Collection } from "@/types";

interface InvitationPageProps {
  params: { token: string };
}

export default function InvitationPage({ params }: InvitationPageProps) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    const fetchInvitation = async () => {
      try {
        const inviteData = await apiGet<Invitation>(`/api/invitations/accept?token=${params.token}`);
        setInvitation(inviteData);

        // Fetch collection details
        try {
          const collectionData = await apiGet<Collection>(`/api/collections/${inviteData.collectionId}`);
          setCollection(collectionData);
        } catch {
          // Continue without collection details if fetch fails
        }
      } catch (err: any) {
        setError(err?.message || "Invitation not found or expired");
      } finally {
        setLoading(false);
      }
    };

    fetchInvitation();
  }, [params.token]);

  async function handleAccept() {
    if (!invitation) return;
    setAccepting(true);
    setError("");

    try {
      await apiPost(`/api/invitations/accept?token=${params.token}`, {});
      router.push(`/collections/${invitation.collectionId}`);
    } catch (err: any) {
      setError(err?.message || "Failed to accept invitation");
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-sm w-full">
          <ErrorMessage message={error || "Invalid invitation"} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-plaster p-4">
      <div className="max-w-sm w-full bg-chalk rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-ink mb-2">You&apos;re invited!</h1>
        <p className="text-ink-soft mb-6">
          You&apos;ve been invited to collaborate on a collection.
        </p>

        <div className="bg-verdigris-soft border border-line rounded-lg p-4 mb-6">
          <p className="text-sm font-medium text-ink">Collection</p>
          <p className="text-lg font-bold text-verdigris">{collection?.name || "Loading..."}</p>
          {collection?.description && (
            <p className="text-xs text-ink-soft mt-2">{collection.description}</p>
          )}
        </div>

        <div className="flex gap-3">
          <Button fullWidth onClick={handleAccept} disabled={accepting}>
            {accepting ? "Accepting..." : "Accept Invitation"}
          </Button>
          <Button variant="secondary" fullWidth onClick={() => router.push("/")}>
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}
