import type { Item } from "@/types";
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
    <Link href={`/collections/${collectionId}/items/${item.id}`} className="group block">
      <Card interactive padding="none" className="overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* The photograph is the loudest thing on screen. */}
          <div className="relative aspect-[4/3] md:aspect-auto md:w-2/5 md:self-stretch bg-accent-aqua flex items-center justify-center overflow-hidden">
            {heroPhotoUrl ? (
              <Image src={heroPhotoUrl} alt={item.name} fill className="object-cover" />
            ) : (
              <span className="font-display text-7xl text-ink-soft/70" aria-hidden>
                {item.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* The affirmation, held in calm. */}
          <div className="flex flex-1 flex-col justify-center gap-3 p-6 sm:p-10">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-decor" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-spark">
                  <path d="M12 2.5l2.1 5.6 5.9.3-4.6 3.7 1.6 5.7L12 20.3 7 17.8l1.6-5.7-4.6-3.7 5.9-.3z" />
                </svg>
              </span>
              <span className="font-display text-lg text-ink">What you love most</span>
            </div>
            <p className="font-display text-3xl text-ink sm:text-4xl">{item.name}</p>
            {item.brand && <p className="text-ink-soft">{item.brand}</p>}
          </div>
        </div>
      </Card>
    </Link>
  );
}
