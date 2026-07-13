import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { PhotoController } from "@/server/api/photos";
import { AppLayout } from "@/components/layout";
import { Card } from "@/components/ui";
import { PhotoUpload } from "@/features/items/PhotoUpload";
import { PhotoGallery } from "@/features/items/PhotoGallery";
import { itemDisplayName } from "@/lib/items";

interface PhotoPageProps {
  params: Promise<{ id: string; itemNumber: string }>;
}

export default async function PhotoPage({ params }: PhotoPageProps) {
  const { id, itemNumber } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);

  const number = Number(itemNumber);
  const item =
    number > 0 && Number.isInteger(number)
      ? await ItemController.fromDb(db).getByCollectionAndNumber(collection.id, number)
      : null;

  if (!item) {
    redirect(`/collections/${collection.slug ?? collection.id}/items`);
  }

  const photos = await PhotoController.fromDb(db).findByItem(item.id);

  const allItems = await ItemController.fromDb(db).listItems(collection.id);
  const otherItems = allItems
    .filter((i) => i.id !== item.id)
    .map((i) => ({ id: i.id, number: i.number, name: i.name }));

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Items", href: `/collections/${collection.slug ?? collection.id}/items` },
        { label: itemDisplayName(item), href: `/collections/${collection.slug ?? collection.id}/items/${item.number}` },
        { label: "Photos" },
      ]}
    >
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl text-ink">{itemDisplayName(item)}</h1>
          <p className="mt-2 text-ink-soft">Manage photos for this item</p>
        </div>

        {/* Upload Section */}
        <Card padding="lg">
          <h2 className="text-lg text-ink mb-4">Add photos</h2>
          <PhotoUpload itemId={item.id} collectionId={collection.id} />
        </Card>

        {/* Gallery Section */}
        {photos.length > 0 && (
          <Card padding="lg">
            <h2 className="text-lg text-ink mb-4">Photos</h2>
            <PhotoGallery
              photos={photos}
              itemId={item.id}
              collectionId={collection.id}
              otherItems={otherItems}
            />
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
