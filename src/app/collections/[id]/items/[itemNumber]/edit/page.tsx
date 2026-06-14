import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { AppLayout } from "@/components/layout";
import { ItemEditForm } from "@/features/items/ItemEditForm";
import { itemDisplayName } from "@/lib/items";

interface ItemEditPageProps {
  params: { id: string; itemNumber: string };
}

export default async function ItemEditPage({ params }: ItemEditPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collectionRepo = new CollectionRepository(db);
  const itemRepo = new ItemRepository(db);
  const number = Number(params.itemNumber);
  const [collection, item] = await Promise.all([
    collectionRepo.findById(params.id),
    Number.isInteger(number)
      ? itemRepo.findByCollectionAndNumber(params.id, number)
      : Promise.resolve(null),
  ]);

  if (!collection || !item) {
    redirect(`/collections/${params.id}/items`);
  }

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Items", href: `/collections/${params.id}/items` },
        { label: itemDisplayName(item), href: `/collections/${params.id}/items/${item.number}` },
        { label: "Edit" },
      ]}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl text-ink">Edit Item</h1>
          <p className="mt-2 text-ink-soft">Update item details and metadata</p>
        </div>

        <ItemEditForm item={item} collectionId={params.id} />
      </div>
    </AppLayout>
  );
}
