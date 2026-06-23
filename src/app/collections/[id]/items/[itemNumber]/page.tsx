import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { AppLayout } from "@/components/layout";
import { Button, Card } from "@/components/ui";
import { ItemMetadata } from "@/features/items/ItemMetadata";
import { ItemPhotoCarousel } from "@/features/items/ItemPhotoCarousel";
import type { ViewerPhoto } from "@/components/ui";
import Link from "next/link";
import { hasName, itemDisplayName } from "@/lib/items";

interface ItemDetailPageProps {
  params: { id: string; itemNumber: string };
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const itemRepo = new ItemRepository(db);
  const photoRepo = new PhotoRepository(db);
  const membershipRepo = new MembershipRepository(db);

  // Show the delete control to any member (owner or curator) — the DELETE API
  // enforces the same photos:write = member-or-owner rule, so this matches the
  // real authz boundary without relying on the now-removed per-flag fields.
  const membership = await membershipRepo.findByUser(session.user.id, collection.id);
  const canDeletePhotos =
    collection.ownerId === session.user.id || membership !== null;

  const number = Number(params.itemNumber);
  const item =
    number > 0 && Number.isInteger(number)
      ? await itemRepo.findByCollectionAndNumber(collection.id, number)
      : null;

  if (!item) {
    redirect(`/collections/${collection.slug ?? collection.id}/items`);
  }

  const photos = await photoRepo.findByItem(item.id);
  const nav = `/collections/${collection.slug ?? collection.id}/items/${item.number}`;
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
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Items", href: `/collections/${collection.slug ?? collection.id}/items` },
        { label: itemDisplayName(item) },
      ]}
    >
      <div className="space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl text-ink">{itemDisplayName(item)}</h1>
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
          <Link href={editHref}>
            <Button>Edit</Button>
          </Link>
        </div>

        <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
          {/* Photos lead — flip through them all (tap-first, no swipe). */}
          <ItemPhotoCarousel
            photos={orderedPhotos}
            collectionId={collection.id}
            itemName={itemDisplayName(item)}
            addPhotosHref={photosHref}
            canDelete={canDeletePhotos}
          />

          {/* Details — with a contextual edit affordance (purses-0gv). */}
          <Card padding="lg" className="h-fit">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-lg text-ink">Details</h2>
              {hasMetadata && (
                <Link href={editHref} className="text-sm text-primary underline underline-offset-2">
                  Edit details
                </Link>
              )}
            </div>
            <ItemMetadata item={item} editHref={editHref} />
            {photos.length > 0 && (
              <Link
                href={photosHref}
                className="mt-6 inline-block text-sm text-ink-soft underline underline-offset-2"
              >
                Manage photos
              </Link>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
