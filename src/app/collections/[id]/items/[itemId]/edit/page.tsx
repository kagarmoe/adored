import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { AppLayout } from "@/components/layout";
import { ItemEditForm } from "@/features/items/ItemEditForm";

interface ItemEditPageProps {
  params: { id: string; itemId: string };
}

export default async function ItemEditPage({ params }: ItemEditPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collectionRepo = new CollectionRepository(db);
  const itemRepo = new ItemRepository(db);
  const [collection, item] = await Promise.all([
    collectionRepo.findById(params.id),
    itemRepo.findById(params.itemId),
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
        { label: item.name, href: `/collections/${params.id}/items/${params.itemId}` },
        { label: "Edit" },
      ]}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-ink">Edit Item</h1>
          <p className="mt-2 text-ink-soft">Update item details and metadata</p>
        </div>

        <ItemEditForm item={item} collectionId={params.id} />
      </div>
    </AppLayout>
  );
}
