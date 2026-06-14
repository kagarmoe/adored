import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { AppLayout } from "@/components/layout";
import { Card } from "@/components/ui";
import { PhotoUpload } from "@/features/items/PhotoUpload";
import { PhotoGallery } from "@/features/items/PhotoGallery";
import { itemDisplayName } from "@/lib/items";

interface PhotoPageProps {
  params: { id: string; itemNumber: string };
}

export default async function PhotoPage({ params }: PhotoPageProps) {
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
      ? await itemRepo.findByCollectionAndNumber(params.id, number)
      : null;

  if (!item) {
    redirect(`/collections/${params.id}/items`);
  }

  const photos = await photoRepo.findByItem(item.id);

  const allItems = await itemRepo.findByCollection(params.id);
  const otherItems = allItems
    .filter((i) => i.id !== item.id)
    .map((i) => ({ id: i.id, number: i.number, name: i.name }));

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Items", href: `/collections/${params.id}/items` },
        { label: itemDisplayName(item), href: `/collections/${params.id}/items/${item.number}` },
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
          <h2 className="text-lg text-ink mb-4">Add Photos</h2>
          <PhotoUpload itemId={item.id} collectionId={params.id} />
        </Card>

        {/* Gallery Section */}
        {photos.length > 0 && (
          <Card padding="lg">
            <h2 className="text-lg text-ink mb-4">Photos</h2>
            <PhotoGallery
              photos={photos}
              itemId={item.id}
              collectionId={params.id}
              otherItems={otherItems}
            />
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
