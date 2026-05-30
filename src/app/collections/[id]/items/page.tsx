import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { AppLayout } from "@/components/layout";
import { Button, EmptyState } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import Link from "next/link";

interface ItemsPageProps {
  params: { id: string };
}

export default async function ItemsPage({ params }: ItemsPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collectionRepo = new CollectionRepository(db);
  const itemRepo = new ItemRepository(db);

  const collection = await collectionRepo.findById(params.id);
  if (!collection) {
    redirect("/collections");
  }

  const items = await itemRepo.findByCollection(params.id);

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Items" },
      ]}
    >
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Items</h1>
            <p className="text-gray-600 mt-2">{items.length} items in collection</p>
          </div>
          <Link href={`/collections/${params.id}/items/new`}>
            <Button>Add Item</Button>
          </Link>
        </div>

        {items.length === 0 ? (
          <EmptyState
            heading="No items yet"
            message="Add items to start organizing your collection"
            action={{
              label: "Add Item",
              onClick: () => (window.location.href = `/collections/${params.id}/items/new`),
            }}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} collectionId={params.id} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
