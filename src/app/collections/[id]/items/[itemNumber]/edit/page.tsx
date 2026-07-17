import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { ItemEditForm } from "@/features/items/ItemEditForm";

interface ItemEditPageProps {
  params: Promise<{ id: string; itemNumber: string }>;
}

export default async function ItemEditPage({ params }: ItemEditPageProps) {
  const { id, itemNumber } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);
  const number = Number(itemNumber);
  const item =
    number > 0 && Number.isInteger(number)
      ? await ItemController.fromDb(db).getByCollectionAndNumber(collection.id, number)
      : null;

  if (!item) {
    redirect(`/collections/${collection.slug ?? collection.id}/items`);
  }

  return (
    <AppLayout breadcrumbs={trail.itemEdit(collection, item)}>
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl text-ink sm:text-3xl">Edit item</h1>
          <p className="mt-2 text-ink-soft">Update item details and metadata</p>
        </div>

        <ItemEditForm item={item} collectionId={collection.id} />
      </div>
    </AppLayout>
  );
}
