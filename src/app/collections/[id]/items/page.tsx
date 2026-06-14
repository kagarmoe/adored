import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { getPhotoAssetUrlForPhoto } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { Button, EmptyState } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { ItemFilters } from "@/features/items/ItemFilters";
import { filterItems, itemsEmptyState } from "@/lib/items";
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
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const itemRepo = new ItemRepository(db);

  const items = await itemRepo.findByCollection(params.id);
  const covers = await new PhotoRepository(db).findCoverPhotosByItemIds(
    items.map((i) => i.id),
  );
  const activeFilter = ["active", "archived", "deleted"].includes(searchParams?.status || "")
    ? searchParams!.status!
    : "all";
  const unnamed = searchParams?.unnamed === "1";
  const filteredItems = filterItems(items, { status: activeFilter, unnamed });
  const empty = itemsEmptyState({
    hasAnyItems: items.length > 0,
    unnamed,
    status: activeFilter,
  });

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
            <p className="text-ink-soft mt-2">
              {items.length} {items.length === 1 ? "item" : "items"} in collection
            </p>
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

        {filteredItems.length === 0 ? (
          <EmptyState
            heading={empty.heading}
            message={empty.message}
            action={
              items.length === 0
                ? { label: "Add Item", href: `/collections/${params.id}/items/new` }
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredItems.map((item) => {
              const cover = covers.get(item.id);
              return (
                <ItemCard
                  key={item.id}
                  item={item}
                  collectionId={params.id}
                  heroPhotoUrl={cover ? getPhotoAssetUrlForPhoto(cover, params.id) : undefined}
                />
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
