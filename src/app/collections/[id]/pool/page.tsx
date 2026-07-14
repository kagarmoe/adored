import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { PhotoController } from "@/server/api/photos";
import { ItemController } from "@/server/api/items";
import { AppLayout } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { PoolUpload } from "@/features/pool/PoolUpload";
import { PoolPhotoGrid } from "@/features/pool/PoolPhotoGrid";

interface PoolPageProps {
  params: Promise<{ id: string }>;
}

export default async function PoolPage({ params }: PoolPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);
  const pool = await PhotoController.fromDb(db).findPoolByCollection(collection.id);

  // Existing items feed the "Move to…" chooser's destination list, mirroring the
  // item-side move flow (PhotoGallery -> PhotoMoveBar).
  const items = await ItemController.fromDb(db).listItems(collection.id);
  const targets = items.map((i) => ({ id: i.id, number: i.number, name: i.name }));

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Photos" },
      ]}
    >
      <div className="space-y-8">
        <div className="max-w-3xl">
          <h1 className="text-2xl text-ink sm:text-3xl">Photos</h1>
          <p className="mt-2 text-ink-soft">
            Dump everything in fast. Group them into items later — or never. There&rsquo;s no rush.
          </p>
        </div>

        <PoolUpload collectionId={collection.id} />

        {pool.length === 0 ? (
          <EmptyState
            heading="No loose photos yet"
            message="Photos you add here wait for you until you're ready to group them."
          />
        ) : (
          <PoolPhotoGrid
            collectionId={collection.id}
            photos={pool.map((p) => ({ id: p.id, filename: p.filename }))}
            targets={targets}
          />
        )}
      </div>
    </AppLayout>
  );
}
