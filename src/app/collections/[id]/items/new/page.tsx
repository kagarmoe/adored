import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { AppLayout } from "@/components/layout";
import { ItemForm } from "@/features/items/ItemForm";

interface AddItemPageProps {
  params: Promise<{ id: string }>;
}

export default async function AddItemPage({ params }: AddItemPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Items", href: `/collections/${collection.slug ?? collection.id}/items` },
        { label: "Add" },
      ]}
    >
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-6 text-2xl text-ink sm:mb-8 sm:text-3xl">Add item</h1>
        <ItemForm collectionId={collection.id} mode="create" />
      </div>
    </AppLayout>
  );
}
