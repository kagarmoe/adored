import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { AppLayout } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { PoolUpload } from "@/features/pool/PoolUpload";
import { PoolPhotoGrid } from "@/features/pool/PoolPhotoGrid";

interface PoolPageProps {
  params: { id: string };
}

export default async function PoolPage({ params }: PoolPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const pool = await new PhotoRepository(db).findPoolByCollection(params.id);

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Add photos" },
      ]}
    >
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl text-ink">Add photos</h1>
          <p className="mt-2 text-ink-soft">
            Get your photos in now — name and group them whenever you like.
          </p>
        </div>

        <PoolUpload collectionId={params.id} />

        {pool.length === 0 ? (
          <EmptyState
            heading="No loose photos yet"
            message="Photos you add here wait for you until you're ready to group them."
          />
        ) : (
          <PoolPhotoGrid
            collectionId={params.id}
            photos={pool.map((p) => ({ id: p.id, filename: p.filename }))}
          />
        )}
      </div>
    </AppLayout>
  );
}
