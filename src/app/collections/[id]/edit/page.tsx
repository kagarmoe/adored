import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionOwnerPage } from "@/lib/collection-access";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { CollectionForm } from "@/features/collections/CollectionForm";
import { DeleteCollectionSection } from "@/features/collections/DeleteCollectionSection";

interface EditPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCollectionPage({ params }: EditPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  // Owner-only page: edit settings and delete are collection:manage operations.
  const collection = await requireCollectionOwnerPage(db, id, session.user.id);

  return (
    <AppLayout breadcrumbs={trail.collectionEdit(collection)}>
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-6 text-2xl text-ink sm:mb-8 sm:text-3xl">Edit collection</h1>
        <CollectionForm collection={collection} mode="edit" />
        <DeleteCollectionSection collectionId={collection.id} collectionName={collection.name} />
      </div>
    </AppLayout>
  );
}
