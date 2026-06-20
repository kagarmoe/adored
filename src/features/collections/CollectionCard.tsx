import type { Collection } from "@/types";
import { Badge, Card, PhotoViewControl, type ViewerPhoto } from "@/components/ui";
import Image from "next/image";
import Link from "next/link";

interface CollectionCardProps {
  collection: Collection;
  coverPhotoUrl?: string;
  /** When set, a "view photo" control opens the zoom/rotate lightbox for the cover. */
  viewerPhoto?: ViewerPhoto;
}

export function CollectionCard({ collection, coverPhotoUrl, viewerPhoto }: CollectionCardProps) {
  // Stretched-link pattern: the navigating <Link> is an overlay sibling (not a
  // wrapper), so the view control is valid DOM and its tap doesn't navigate.
  // `isolate` scopes the z-index stack so the control (z-20) sits above the link (z-10).
  return (
    <Card interactive padding="none" className="relative isolate flex h-full flex-col overflow-hidden">
      {/* Cover — the photograph leads. Branded placeholder until a real cover exists. */}
      <div className="relative flex aspect-[4/3] items-center justify-center bg-accent-aqua">
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
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg text-ink line-clamp-2">{collection.name}</h3>
          {collection.status !== "active" && (
            <Badge variant={collection.status} className="shrink-0">{collection.status}</Badge>
          )}
        </div>
        {collection.description && (
          <p className="text-sm text-ink-soft line-clamp-2">{collection.description}</p>
        )}
      </div>

      <Link
        href={`/collections/${collection.slug ?? collection.id}`}
        className="absolute inset-0 z-10"
        aria-label={collection.name}
      />
      {viewerPhoto && <PhotoViewControl photo={viewerPhoto} className="absolute right-2 top-2 z-20" />}
    </Card>
  );
}
