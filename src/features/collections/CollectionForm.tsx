"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Collection } from "@/types";
import { Button, Input, Textarea, ErrorMessage } from "@/components/ui";
import { apiPost, apiPatch } from "@/lib/api-client";
import { z } from "zod";

const collectionSchema = z.object({
  name: z.string().min(1, "Collection name is required"),
  description: z.string().optional(),
});

interface CollectionFormProps {
  collection?: Collection;
  mode: "create" | "edit";
}

export function CollectionForm({ collection, mode }: CollectionFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: collection?.name || "",
    description: collection?.description || "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const validated = collectionSchema.parse(formData);

      if (mode === "create") {
        const result = await apiPost<Collection>("/api/collections", validated);
        router.push(`/collections/${result.slug ?? result.id}`);
      } else if (collection) {
        const result = await apiPatch<Collection>(`/api/collections/${collection.id}`, validated);
        router.push(`/collections/${result.slug ?? result.id}`);
      }
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError(err?.message || "Failed to save collection");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && <ErrorMessage message={error} />}

      <Input
        label="Collection name"
        required
        value={formData.name}
        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
        disabled={loading}
      />

      <Textarea
        label="Description"
        placeholder="What is this collection about?"
        value={formData.description}
        onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
        disabled={loading}
        rows={4}
      />

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : mode === "create" ? "Create collection" : "Save changes"}
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
