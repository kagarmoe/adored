import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { AppLayout } from "@/components/layout";
import { Button, Card } from "@/components/ui";
import { ItemMetadata } from "@/features/items/ItemMetadata";
import Link from "next/link";
import Image from "next/image";
import { getPhotoAssetUrlForPhoto } from "@/lib/photos";
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

  const number = Number(params.itemNumber);
  const item =
    number > 0 && Number.isInteger(number)
      ? await itemRepo.findByCollectionAndNumber(collection.id, number)
      : null;

  if (!item) {
    redirect(`/collections/${collection.slug ?? collection.id}/items`);
  }

  const photos = await photoRepo.findByItem(item.id);
  const heroPhoto = photos.find((p) => p.isHero);

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
                href={`/collections/${collection.slug ?? collection.id}/items/${item.number}/edit`}
                className="mt-1 inline-block text-ink-soft underline underline-offset-2"
              >
                Add a name
              </Link>
            )}
          </div>
          <Link href={`/collections/${collection.slug ?? collection.id}/items/${item.number}/edit`}>
            <Button>Edit</Button>
          </Link>
        </div>

        {/* Hero Photo */}
        {heroPhoto ? (
          <div className="bg-ground rounded-lg overflow-hidden h-96 flex items-center justify-center">
            <Image
              src={getPhotoAssetUrlForPhoto(heroPhoto, collection.id)}
              alt={itemDisplayName(item)}
              fill
              className="object-cover"
              priority
              unoptimized
            />
          </div>
        ) : (
          <Card padding="lg" className="h-96 flex items-center justify-center">
            <div className="text-center">
              <span className="text-6xl block mb-2">📷</span>
              <p className="text-ink-soft">No hero photo</p>
              <Link href={`/collections/${collection.slug ?? collection.id}/items/${item.number}/photos`}>
                <Button className="mt-4">Add Photos</Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Item Metadata */}
        <Card padding="lg">
          <h2 className="text-lg text-ink mb-4">Details</h2>
          <ItemMetadata item={item} />
        </Card>

        {/* Photo Gallery */}
        {photos.length > 0 && (
          <Card padding="lg">
            <h2 className="text-lg text-ink mb-4">Photos</h2>
            <div className="grid grid-cols-3 gap-4">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="bg-ground rounded-lg overflow-hidden aspect-square relative"
                >
                  <Image
                    src={getPhotoAssetUrlForPhoto(photo, collection.id)}
                    alt="Item photo"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  {photo.isHero && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <span className="text-white text-sm font-semibold">Hero</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Link href={`/collections/${collection.slug ?? collection.id}/items/${item.number}/photos`}>
              <Button className="mt-4" variant="secondary">
                Manage Photos
              </Button>
            </Link>
          </Card>
        )}

        {/* No Photos State */}
        {photos.length === 0 && (
          <Card padding="lg" className="text-center">
            <p className="text-ink-soft mb-4">No photos yet</p>
            <Link href={`/collections/${collection.slug ?? collection.id}/items/${item.number}/photos`}>
              <Button>Add Photos</Button>
            </Link>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
