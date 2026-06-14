import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { AppLayout } from "@/components/layout";
import { Button, EmptyState } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { ItemFilters } from "@/features/items/ItemFilters";
import { filterItems } from "@/lib/items";
import Link from "next/link";

interface ItemsPageProps {
  params: { id: string };
  searchParams?: { status?: string; unnamed?: string };
}

export default async function ItemsPage({ params, searchParams }: ItemsPageProps) {
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
  const activeFilter = ["active", "archived", "deleted"].includes(searchParams?.status || "")
    ? searchParams!.status!
    : "all";
  const unnamed = searchParams?.unnamed === "1";
  const filteredItems = filterItems(items, { status: activeFilter, unnamed });

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
            <h1 className="text-3xl text-ink">Items</h1>
            <p className="text-ink-soft mt-2">{items.length} items in collection</p>
          </div>
          <div className="flex gap-3">
            <Link href={`/collections/${params.id}/pool`}>
              <Button variant="secondary">Add photos</Button>
            </Link>
            <Link href={`/collections/${params.id}/items/new`}>
              <Button>Add Item</Button>
            </Link>
          </div>
        </div>

        <ItemFilters activeFilter={activeFilter} unnamed={unnamed} collectionId={params.id} />

        {items.length === 0 ? (
          <EmptyState
            heading="No items yet"
            message="Add items to start organizing your collection"
            action={{
              label: "Add Item",
              href: `/collections/${params.id}/items/new`,
            }}
          />
        ) : filteredItems.length === 0 ? (
          unnamed ? (
            <EmptyState
              heading="Everything has a name"
              message="Nothing is waiting — name things whenever you like."
            />
          ) : (
            <EmptyState
              heading={`No ${activeFilter} items`}
              message="Try a different status filter"
            />
          )
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredItems.map((item) => (
              <ItemCard key={item.id} item={item} collectionId={params.id} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
