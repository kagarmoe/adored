"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

interface StartSortingButtonProps {
  collectionId: string;
  collectionSlug: string;
}

// purses-znkt.1: the hub's one-tap primary. POSTs {collectionId} ONLY — no
// canned goal; a null goal's gentle fallback already lives on SessionResumeCard
// — then lands on the same triage URL StartSessionForm's deliberate path uses.
// A 409 (raced open session, sessions_active_unique) is not an error to fight:
// it means a sort is already there, so we say so gently and refresh — the
// resume card takes it from here.
export function StartSortingButton({ collectionId, collectionSlug }: StartSortingButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId }),
      });

      if (response.status === 201) {
        const newSession = await response.json();
        router.push(`/collections/${collectionSlug}/sort/${newSession.number}/triage`);
        // Stay disabled through the navigation — no flash of a re-enabled button.
        return;
      }

      if (response.status === 409) {
        setMessage("Your sort is already open — resuming is one tap away.");
        setIsSubmitting(false);
        router.refresh();
        return;
      }

      setMessage("That didn't go through — give it another try in a moment.");
      setIsSubmitting(false);
    } catch (error) {
      setMessage("That didn't go through — give it another try in a moment.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        onClick={handleClick}
        disabled={isSubmitting}
        aria-label={isSubmitting ? "Starting" : "Start sorting"}
        className="w-full sm:w-auto"
      >
        {isSubmitting ? "Starting…" : "Start sorting"}
      </Button>
      {message && (
        <p role="status" className="text-sm text-ink-soft">
          {message}
        </p>
      )}
    </div>
  );
}
