"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/components/ui";

interface FinalizeResultFormProps {
  collectionId: string;
  resultId: string;
  defaultName: string;
}

export function FinalizeResultForm({ collectionId, resultId, defaultName }: FinalizeResultFormProps) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (name !== defaultName) {
      const updateResponse = await fetch(`/api/sort-results/${resultId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!updateResponse.ok) {
        setError("Unable to update result name");
        setIsSubmitting(false);
        return;
      }
    }

    const response = await fetch(`/api/sort-results/${resultId}/finalize`, { method: "POST" });
    if (!response.ok) {
      setError("Unable to finalize result");
      setIsSubmitting(false);
      return;
    }

    router.push(`/collections/${collectionId}/results/${resultId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card padding="lg">
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Name this result</label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Spring edit 2026" />
          </div>

          <div>
            <p className="mb-3 block text-sm font-medium text-gray-700">Visibility</p>
            <div className="space-y-3">
              <label className="block rounded-lg border border-blue-200 bg-blue-50 p-4">
                <input type="radio" name="visibility" value="private" defaultChecked />
                <span className="ml-2 font-medium text-gray-900">Private</span>
                <span className="mt-1 block text-sm text-gray-600">Only you can see it.</span>
              </label>
              <label className="block rounded-lg border border-gray-200 p-4">
                <input type="radio" name="visibility" value="shareable" />
                <span className="ml-2 font-medium text-gray-900">Shareable by link</span>
                <span className="mt-1 block text-sm text-gray-600">Create links after finalizing.</span>
              </label>
            </div>
          </div>
        </div>
      </Card>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        Finalizing snapshots the current order. New sorting can start a fresh draft while this result stays frozen.
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Finalizing..." : "Finalize"}
        </Button>
      </div>
    </form>
  );
}
