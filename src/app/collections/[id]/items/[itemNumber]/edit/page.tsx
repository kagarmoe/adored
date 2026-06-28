import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
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
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const number = Number(params.itemNumber);
  const item =
    number > 0 && Number.isInteger(number)
      ? await ItemController.fromDb(db).getByCollectionAndNumber(collection.id, number)
      : null;

  if (!item) {
    redirect(`/collections/${collection.slug ?? collection.id}/items`);
  }

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Items", href: `/collections/${collection.slug ?? collection.id}/items` },
        { label: itemDisplayName(item), href: `/collections/${collection.slug ?? collection.id}/items/${item.number}` },
        { label: "Edit" },
      ]}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl text-ink">Edit item</h1>
          <p className="mt-2 text-ink-soft">Update item details and metadata</p>
        </div>

        <ItemEditForm item={item} collectionId={collection.id} />
      </div>
    </AppLayout>
  );
}
