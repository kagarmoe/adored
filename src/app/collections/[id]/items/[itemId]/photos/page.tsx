import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { AppLayout } from "@/components/layout";
import { Card } from "@/components/ui";
import { PhotoUpload } from "@/features/items/PhotoUpload";
import { PhotoGallery } from "@/features/items/PhotoGallery";
import { itemDisplayName } from "@/lib/items";

interface PhotoPageProps {
  params: { id: string; itemId: string };
}

export default async function PhotoPage({ params }: PhotoPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collectionRepo = new CollectionRepository(db);
  const itemRepo = new ItemRepository(db);
  const photoRepo = new PhotoRepository(db);
  const [collection, item, photos] = await Promise.all([
    collectionRepo.findById(params.id),
    itemRepo.findById(params.itemId),
    photoRepo.findByItem(params.itemId),
  ]);

  if (!collection || !item || item.collectionId !== params.id) {
    redirect(`/collections/${params.id}/items`);
  }

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Items", href: `/collections/${params.id}/items` },
        { label: itemDisplayName(item), href: `/collections/${params.id}/items/${params.itemId}` },
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
          <PhotoUpload itemId={params.itemId} collectionId={params.id} />
        </Card>

        {/* Gallery Section */}
        {photos.length > 0 && (
          <Card padding="lg">
            <h2 className="text-lg text-ink mb-4">Photos</h2>
            <PhotoGallery photos={photos} itemId={params.itemId} collectionId={params.id} />
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
