"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";
import { Button, Input, Textarea, ErrorMessage } from "@/components/ui";
import { apiPost } from "@/lib/api-client";
import { z } from "zod";

const itemSchema = z.object({
  name: z.string().min(1, "Item name is required"),
  brand: z.string().optional(),
  style: z.string().optional(),
  color: z.string().optional(),
  material: z.string().optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
});

export function ItemForm({ collectionId }: { collectionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    brand: "",
    style: "",
    color: "",
    material: "",
    category: "",
    notes: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const validated = itemSchema.parse(formData);

      const result = await apiPost<Item>(`/api/collections/${collectionId}/items`, validated);
      // The server assigns a catalog number; the page URL uses that human-readable number.
      router.push(`/collections/${collectionId}/items/${result.number}`);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0].message);
      } else {
        setError(err?.message || "Failed to save item");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && <ErrorMessage message={error} />}

      <Input
        label="Item name"
        required
        value={formData.name}
        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
        disabled={loading}
      />

      <Input
        label="Brand"
        value={formData.brand}
        onChange={(e) => setFormData((prev) => ({ ...prev, brand: e.target.value }))}
        disabled={loading}
      />

      <Input
        label="Style"
        value={formData.style}
        onChange={(e) => setFormData((prev) => ({ ...prev, style: e.target.value }))}
        disabled={loading}
      />

      <Input
        label="Color"
        value={formData.color}
        onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
        disabled={loading}
      />

      <Input
        label="Material"
        value={formData.material}
        onChange={(e) => setFormData((prev) => ({ ...prev, material: e.target.value }))}
        disabled={loading}
      />

      <Input
        label="Category"
        value={formData.category}
        onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
        disabled={loading}
      />

      <Textarea
        label="Notes"
        value={formData.notes}
        onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
        disabled={loading}
        rows={4}
      />

      <div className="grid grid-cols-2 gap-3 sm:flex">
        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
          {loading ? "Saving..." : "Add item"}
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={() => router.back()}
          disabled={loading}
          className="w-full sm:w-auto"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
