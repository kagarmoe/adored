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
            Add details
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filledFields.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {filledFields.map((field) => (
            <li
              key={field.label}
              className="rounded-full bg-surface-raised px-3 py-1 text-sm text-ink"
            >
              <span className="text-ink-soft">{field.label}: </span>
              {field.value}
            </li>
          ))}
        </ul>
      )}
      {item.notes && (
        <div>
          <p className="text-xs font-medium text-ink-soft uppercase">Notes</p>
          <p className="mt-1 text-sm text-ink whitespace-pre-wrap">{item.notes}</p>
        </div>
      )}
    </div>
  );
}
