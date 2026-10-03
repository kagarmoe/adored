import type { Collection } from "@/types";
import { Card } from "@/components/ui";
import Image from "next/image";
import Link from "next/link";

interface CollectionCardProps {
  collection: Collection;
  coverPhotoUrl?: string;
  /** Calm, informational cue that loose photos are waiting in this collection's pool. */
  hasPooledPhotos?: boolean;
  /** The owner's ··· menu (CollectionCardMenu); absent for a curator. */
  menu?: React.ReactNode;
}

export function CollectionCard({ collection, coverPhotoUrl, hasPooledPhotos, menu }: CollectionCardProps) {
  // Stretched-link pattern: the navigating <Link> is an overlay sibling (not a
  // wrapper), so the menu is valid DOM and its tap doesn't navigate.
  // `isolate` scopes the z-index stack so the menu (z-20) sits above the link (z-10).
  return (
    <Card interactive padding="none" className="relative isolate flex h-full flex-col overflow-hidden">
      {/* Cover — the photograph leads. Branded placeholder until a real cover exists. */}
      <div className="relative flex aspect-4/3 items-center justify-center bg-content-soft">
        {coverPhotoUrl ? (
          <Image
            src={coverPhotoUrl}
            alt={collection.name}
            fill
            sizes="(min-width:1024px) 25vw, (min-width:768px) 33vw, 50vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-ink-soft/50">
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
            <path d="M5 17l4.5-4.5a2 2 0 0 1 2.8 0L19 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </div>

      {/* Name leads; description is a quiet second line. No counts, no dates. */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="min-w-0 break-words font-display text-lg text-ink line-clamp-2">{collection.name}</h3>
        {collection.description && (
          <p className="text-sm text-ink-soft line-clamp-2">{collection.description}</p>
        )}
        {/* Calm cue, not a status or an action: cool-blue benign (info-soft/info-deep,
            an AA-proven pairing), never a warning hue. The text carries the meaning
            so it's perceivable beyond colour; it sits under the stretched link, so
            it never competes with the card's single navigating action. */}
        {hasPooledPhotos && (
          <p className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-pill bg-info-soft px-3 py-1 text-sm text-info-deep">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
              <path d="M5 17l4.5-4.5a2 2 0 0 1 2.8 0L19 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Photos waiting
          </p>
        )}
      </div>

      <Link
        href={`/collections/${collection.slug ?? collection.id}`}
        className="absolute inset-0 z-10"
        aria-label={collection.name}
      />
      {menu && <div className="absolute right-2 top-2 z-20">{menu}</div>}
    </Card>
  );
}
