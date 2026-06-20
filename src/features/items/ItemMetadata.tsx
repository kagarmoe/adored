import type { Item } from "@/types";
import Link from "next/link";

interface ItemMetadataProps {
  item: Item;
  /** Where the empty-state "add details" CTA routes (the item's edit page). */
  editHref?: string;
}

export function ItemMetadata({ item, editHref }: ItemMetadataProps) {
  const fields = [
    { label: "Brand", value: item.brand },
    { label: "Style", value: item.style },
    { label: "Color", value: item.color },
    { label: "Material", value: item.material },
    { label: "Category", value: item.category },
  ];

  const filledFields = fields.filter((f) => f.value);

  if (filledFields.length === 0 && !item.notes) {
    // Affirming, judgement-free — this is about realizing what you love, not cataloguing.
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-soft">
          Every piece has a story. Add a few details whenever you like — there&apos;s no rush.
        </p>
        {editHref && (
          <Link
            href={editHref}
            className="inline-block text-sm text-primary underline underline-offset-2"
          >
            Tell its story
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filledFields.map((field) => (
        <div key={field.label}>
          <p className="text-xs font-medium text-ink-soft uppercase">{field.label}</p>
          <p className="mt-1 text-sm text-ink">{field.value}</p>
        </div>
      ))}
      {item.notes && (
        <div>
          <p className="text-xs font-medium text-ink-soft uppercase">Notes</p>
          <p className="mt-1 text-sm text-ink whitespace-pre-wrap">{item.notes}</p>
        </div>
      )}
    </div>
  );
}
