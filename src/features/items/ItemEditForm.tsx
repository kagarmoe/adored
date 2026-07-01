"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Textarea } from "@/components/ui";
import type { Item } from "@/types";

interface ItemEditFormProps {
  item: Item;
  collectionId: string;
}

export function ItemEditForm({ item, collectionId }: ItemEditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: item.name ?? "",
    brand: item.brand || "",
    style: item.style || "",
    color: item.color || "",
    material: item.material || "",
    category: item.category || "",
    notes: item.notes || "",
    story: item.story ?? "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // PATCH targets the stable ULID; the page URL uses the human-readable catalog number.
      const response = await fetch(
        `/api/collections/${collectionId}/items/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update item");
      }

      router.push(`/collections/${collectionId}/items/${item.number}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <Card padding="lg" className="bg-error-soft border border-error-soft">
          <p className="text-error-deep">{error}</p>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card padding="lg" className="space-y-4">
          <Input
            name="name"
            label="Item name"
            value={formData.name}
            onChange={handleChange}
            required
          />

          <Input
            name="brand"
            label="Brand"
            value={formData.brand}
            onChange={handleChange}
            placeholder="Optional"
          />

          <Input
            name="style"
            label="Style"
            value={formData.style}
            onChange={handleChange}
            placeholder="Optional"
          />

          <Input
            name="color"
            label="Color"
            value={formData.color}
            onChange={handleChange}
            placeholder="Optional"
          />

          <Input
            name="material"
            label="Material"
            value={formData.material}
            onChange={handleChange}
            placeholder="Optional"
          />

          <Input
            name="category"
            label="Category"
            value={formData.category}
            onChange={handleChange}
            placeholder="Optional"
          />

          <Textarea
            name="notes"
            label="Notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Add any additional notes about this item"
          />

          <Textarea
            name="story"
            label="Where will it go next?"
            value={formData.story}
            onChange={handleChange}
            placeholder="To my niece, who always borrowed it…"
            maxLength={2000}
          />
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
