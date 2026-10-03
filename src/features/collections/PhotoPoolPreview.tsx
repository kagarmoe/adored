import { Card, CardImage } from "@/components/ui";
import { getPoolPhotoAssetUrl, PHOTO_WIDTH } from "@/lib/photos";
import { quietLink } from "@/lib/design/quiet-link";
import Link from "next/link";

interface PhotoPoolPreviewProps {
  /** Resolved collection id — used only to build the guarded pool /file URLs. */
  collectionId: string;
  /** Slug-or-id path segment for the /pool route. */
  poolHref: string;
  /**
   * Bounded preview rows (≤6) from findPoolByCollection(collectionId, 6).
   * Only `id` is consumed — passing the minimal shape keeps blobKey/uploadedBy
   * off any future client serialization boundary (defensive, Security LOW).
   */
  photos: { id: string }[];
  /** Show the quiet Make items link (sorting holds the page's primary action). */
  showLink: boolean;
}

// Read-only strip of loose pool photos above the home grid. Its Make items link shows
// only when sorting holds the page's primary action; otherwise the bar's primary is
// Make items itself (one name on screen once) and the thumbnails are a single link to
// the pool. The thumbnails are decorative (alt=""): the link carries the meaning, so
// AT isn't read 4–6 filenames (spec §11).
export function PhotoPoolPreview({ collectionId, poolHref, photos, showLink }: PhotoPoolPreviewProps) {
  const thumbnails = (
    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {photos.map((photo) => (
        <li
          key={photo.id}
          className="relative flex aspect-square items-center justify-center overflow-hidden rounded-control bg-content-soft"
        >
          <CardImage
            src={getPoolPhotoAssetUrl(collectionId, photo.id, { w: PHOTO_WIDTH.poolTile })}
            alt=""
            fallback={<NeutralThumb />}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby="photo-pool-heading">
      <Card padding="lg" className="space-y-4">
        <div>
          <h2 id="photo-pool-heading" className="text-xl text-ink">
            Photos waiting
          </h2>
          <p className="mt-1 text-sm text-ink-soft">These can become items whenever you&rsquo;re ready.</p>
        </div>
        {showLink ? (
          thumbnails
        ) : (
          // Photos-only: the bar's primary already reads "Make items", so the strip is one
          // link to the pool named by the heading — the visible name stays on screen once.
          <Link
            href={poolHref}
            aria-labelledby="photo-pool-heading"
            className="block rounded-control focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
          >
            {thumbnails}
          </Link>
        )}
        {showLink && (
          <Link href={poolHref} className={quietLink}>
            Make items
          </Link>
        )}
      </Card>
    </section>
  );
}

// Calm placeholder for a missing/failed pool thumbnail. Unlike ItemCard's
// fallback there is no item yet, so there is no initial — a neutral mark only.
function NeutralThumb() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-ink-soft/50">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="10" r="1.5" fill="currentColor" />
      <path d="M5 17l4.5-4.5a2 2 0 0 1 2.8 0L19 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
