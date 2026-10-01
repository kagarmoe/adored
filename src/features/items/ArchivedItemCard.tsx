import type { Item } from "@/types";
import { Card, CardImage } from "@/components/ui";
import { itemDisplayName, itemInitial } from "@/lib/items";
import { BringBackButton } from "./BringBackButton";

// An archived item has no panel (its route resolves live items only), so the card
// offers the way back instead of a link.
export function ArchivedItemCard({ item, coverUrl }: { item: Item; coverUrl?: string }) {
  return (
    <Card variant="card" padding="none" className="flex h-full flex-col overflow-hidden">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-content-soft">
        <CardImage
          src={coverUrl}
          alt={itemDisplayName(item)}
          fallback={<span aria-hidden className="font-display text-5xl text-ink-soft">{itemInitial(item)}</span>}
        />
      </div>
      <div className="space-y-2 p-3">
        <h3 className="truncate text-ink">{itemDisplayName(item)}</h3>
        {item.brand && <p className="truncate text-xs text-ink-soft">{item.brand}</p>}
        <BringBackButton itemId={item.id} />
      </div>
    </Card>
  );
}
