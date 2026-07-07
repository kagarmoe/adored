import type { Item } from "@/types";
import Link from "next/link";

interface ItemMetadataProps {
  item: Item;
  /** Where the empty-state "add details" CTA routes (the item's edit page). */
  editHref?: string;
}

// "9 × 11 × 4 in · 1.2 lb" — length dims joined by ×, weight after a middot,
// only the parts that are present. imperial → in/lb, metric → cm/kg.
function formatSize(item: Item): string | null {
  const lengthUnit = item.unit === "metric" ? "cm" : "in";
  const weightUnit = item.unit === "metric" ? "kg" : "lb";
  const dims = [item.height, item.width, item.depth].filter(
    (d): d is string => Boolean(d),
  );

  const parts: string[] = [];
  if (dims.length > 0) parts.push(`${dims.join(" × ")} ${lengthUnit}`);
  if (item.weight) parts.push(`${item.weight} ${weightUnit}`);

  return parts.length > 0 ? parts.join(" · ") : null;
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
  const sizeLabel = formatSize(item);

  if (filledFields.length === 0 && !item.notes && !sizeLabel) {
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
      {(filledFields.length > 0 || sizeLabel) && (
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
          {sizeLabel && (
            <li
              key="size"
              className="rounded-full bg-surface-raised px-3 py-1 text-sm text-ink"
            >
              {sizeLabel}
            </li>
          )}
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
