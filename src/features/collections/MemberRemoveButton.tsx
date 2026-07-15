"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface MemberRemoveButtonProps {
  collectionId: string;
  memberId: string;
}

export function MemberRemoveButton({ collectionId, memberId }: MemberRemoveButtonProps) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  async function removeMember() {
    setError("");
    setRemoving(true);

    try {
      const response = await fetch(`/api/collections/${collectionId}/members/${memberId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError("Could not remove this person just now.");
        return;
      }

      router.refresh();
    } catch {
      setError("Could not remove this person just now.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="flex h-11 items-center rounded-control px-3 text-sm font-medium text-error-deep hover:bg-error-soft focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-error disabled:cursor-not-allowed disabled:opacity-50"
        onClick={removeMember}
        disabled={removing}
      >
        {removing ? "Removing" : "Remove"}
      </button>
      {error && (
        <p className="max-w-40 text-right text-xs text-error-deep" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
