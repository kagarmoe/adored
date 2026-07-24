import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { PhotoController } from "@/server/api/photos";
import { MemberController } from "@/server/api/members";
import { PreferenceController } from "@/server/api/preferences";
import { effectiveBucket } from "@/lib/results-buckets";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { Button, Card } from "@/components/ui";
import { ItemBinSelect } from "@/features/items/ItemBinSelect";
import { ItemDeleteControl } from "@/features/items/ItemDeleteControl";
import { ItemMetadata } from "@/features/items/ItemMetadata";
import { ItemPhotoCarousel } from "@/features/items/ItemPhotoCarousel";
import type { ViewerPhoto } from "@/components/ui";
import Link from "next/link";
import { hasName, itemDisplayName } from "@/lib/items";

interface ItemDetailPageProps {
  params: Promise<{ id: string; itemNumber: string }>;
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const { id, itemNumber } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);

  // Show the photo- and item-delete controls to any member (owner or curator) —
  // the DELETE APIs enforce the same write = member-or-owner rule (photos:write /
  // items:write both resolve to curator), so this matches the real authz boundary.
  const membership = await MemberController.fromDb(db).getByUser(session.user.id, collection.id);
  const canModify =
    collection.ownerId === session.user.id || membership !== null;

  const number = Number(itemNumber);
  const item =
    number > 0 && Number.isInteger(number)
      ? await ItemController.fromDb(db).getByCollectionAndNumber(collection.id, number)
      : null;

  if (!item) {
    redirect(`/collections/${collection.slug ?? collection.id}/items`);
  }

  const photos = await PhotoController.fromDb(db).findByItem(item.id);
  // The "Placed with" bin reflects this curator's live preference overlay
  // (effectiveBucket = manualBucket ?? rankBucket), NOT items.category (purses-xxo7).
  const preference = await PreferenceController.fromDb(db).getItemPreference(item.id, session.user.id);
  const currentBucket = preference
    ? effectiveBucket({ manualBucket: preference.manualBucket, computedBucket: preference.rankBucket })
    : null;
  const collectionHref = `/collections/${collection.slug ?? collection.id}`;
  const nav = `${collectionHref}/items/${item.number}`;
  const editHref = `${nav}/edit`;
  const photosHref = `${nav}/photos`;

  // findByItem has no ORDER BY — order deterministically here: hero first, then oldest.
  const orderedPhotos: ViewerPhoto[] = [...photos]
    .sort(
      (a, b) =>
        Number(b.isHero) - Number(a.isHero) ||
        +new Date(a.createdAt) - +new Date(b.createdAt) ||
        (a.id < b.id ? -1 : 1),
    )
    .map((p) => ({
      id: p.id,
      itemId: item.id,
      collectionId: collection.id,
      rotation: p.rotation,
      updatedAt: p.updatedAt,
      alt: itemDisplayName(item),
    }));

  const hasMetadata = Boolean(
    item.brand || item.style || item.color || item.material || item.category || item.notes,
  );

  return (
    <AppLayout breadcrumbs={trail.item(collection, item)}>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl text-ink sm:text-3xl">{itemDisplayName(item)}</h1>
            {item.brand && <p className="mt-1 text-ink-soft">{item.brand}</p>}
            {!hasName(item) && (
              <Link
                href={editHref}
                className="mt-1 inline-block text-ink-soft underline underline-offset-2"
              >
                Add a name
              </Link>
            )}
          </div>
          <Link href={editHref} className="w-full sm:w-auto">
            <Button className="w-full">Edit</Button>
          </Link>
        </div>

        {/* Keepsake — the story is kept AFTER the choice, never asked before it.
            Leads the page when present; auto-escaped React child (no HTML injection). */}
        {item.story?.trim() && (
          <Card padding="lg" className="bg-decor/10">
            <div className="flex items-center gap-2">
              <span aria-hidden className="h-2 w-2 rounded-full bg-decor" />
              <h2 className="text-lg text-ink">Where will it go next?</h2>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              A keepsake, kept after the choice — never asked before it.
            </p>
            <p className="mt-4 text-ink whitespace-pre-wrap">{item.story}</p>
          </Card>
        )}

        <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
          {/* Photos lead — flip through them all (tap-first, no swipe). */}
          <ItemPhotoCarousel
            photos={orderedPhotos}
            collectionId={collection.id}
            itemName={itemDisplayName(item)}
            addPhotosHref={photosHref}
            canDelete={canModify}
          />

          {/* Details — with a contextual edit affordance (purses-0gv). */}
          <Card padding="lg" className="h-fit">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg text-ink">Details</h2>
              {hasMetadata && (
                <Link href={editHref} className="text-sm text-primary underline underline-offset-2">
                  Edit details
                </Link>
              )}
            </div>
            <ItemMetadata item={item} editHref={editHref} />
            {/* Hand-set bin = a per-curator overlay on live preferences (purses-xxo7):
                effectiveBucket wins the Standing/results partition. See ItemBinSelect. */}
            {canModify && <ItemBinSelect itemId={item.id} value={currentBucket} />}
            {photos.length > 0 && (
              <Link
                href={photosHref}
                className="mt-6 inline-block text-sm text-ink-soft underline underline-offset-2"
              >
                Manage photos
              </Link>
            )}
            {/* Its own bordered block (not another quiet link) so the destructive
                action can't be mistaken for the nav link above it. */}
            {canModify && (
              <ItemDeleteControl itemId={item.id} itemsHref={`${collectionHref}/items`} />
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
