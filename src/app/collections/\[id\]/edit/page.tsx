import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { AppLayout } from "@/components/layout";
import { CollectionForm } from "@/features/collections/CollectionForm";

interface EditPageProps {
  params: { id: string };
}

export default async function EditCollectionPage({ params }: EditPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collectionRepo = new CollectionRepository(db);
  const collection = await collectionRepo.findById(params.id);

  if (!collection) {
    redirect("/collections");
  }

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.id}` },
        { label: "Edit" },
      ]}
    >
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Edit Collection</h1>
        <CollectionForm collection={collection} mode="edit" />
      </div>
    </AppLayout>
  );
}
