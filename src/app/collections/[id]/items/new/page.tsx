import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { AppLayout } from "@/components/layout";
import { ItemForm } from "@/features/items/ItemForm";

interface AddItemPageProps {
  params: { id: string };
}

export default async function AddItemPage({ params }: AddItemPageProps) {
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
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Items", href: `/collections/${params.id}/items` },
        { label: "Add" },
      ]}
    >
      <div className="max-w-2xl">
        <h1 className="text-3xl text-ink mb-8">Add Item</h1>
        <ItemForm collectionId={params.id} mode="create" />
      </div>
    </AppLayout>
  );
}
