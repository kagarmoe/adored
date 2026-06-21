import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { AppLayout } from "@/components/layout";
import { CollectionForm } from "@/features/collections/CollectionForm";
import { DeleteCollectionSection } from "@/features/collections/DeleteCollectionSection";

interface EditPageProps {
  params: { id: string };
}

export default async function EditCollectionPage({ params }: EditPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const isOwner = collection.ownerId === session.user.id;

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Edit" },
      ]}
    >
      <div className="max-w-2xl">
        <h1 className="text-3xl text-ink mb-8">Edit Collection</h1>
        <CollectionForm collection={collection} mode="edit" />
        {isOwner && (
          <DeleteCollectionSection collectionId={collection.id} collectionName={collection.name} />
        )}
      </div>
    </AppLayout>
  );
}
