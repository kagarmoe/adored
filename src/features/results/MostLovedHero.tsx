import type { Item } from "@/types";
import { itemDisplayName, itemInitial } from "@/lib/items";
import { Card } from "@/components/ui";
import Link from "next/link";
import Image from "next/image";

interface MostLovedHeroProps {
  item: Item;
  collectionId: string;
  heroPhotoUrl?: string;
}

/** The affirmation peak of the results page: the single most-loved item, given
 *  real presence. The photograph leads; the lone citron spark marks the moment. */
export function MostLovedHero({ item, collectionId, heroPhotoUrl }: MostLovedHeroProps) {
  return (
    <Link href={`/collections/${collectionId}/items/${item.number}`} className="group block">
      <Card interactive padding="none" className="overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* The photograph is the loudest thing on screen. */}
          <div className="relative aspect-[4/3] md:aspect-auto md:w-2/5 md:self-stretch bg-accent-aqua flex items-center justify-center overflow-hidden">
            {heroPhotoUrl ? (
              <Image
                src={heroPhotoUrl}
                alt={itemDisplayName(item)}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="font-display text-7xl text-ink-soft/70" aria-hidden>
                {itemInitial(item)}
              </span>
            )}
          </div>

          {/* The affirmation, held in calm. */}
          <div className="flex flex-1 flex-col justify-center gap-3 p-6 sm:p-10">
            <div className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-spark" aria-hidden="true" />
              <span className="font-display text-lg text-ink">What you love most</span>
            </div>
            <p className="font-display text-3xl text-ink sm:text-4xl">{itemDisplayName(item)}</p>
            {item.brand && <p className="text-ink-soft">{item.brand}</p>}
          </div>
        </div>
      </Card>
    </Link>
  );
}
