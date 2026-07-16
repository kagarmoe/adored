import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { Button, EmptyState } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { WorkspaceModeChips } from "@/features/collections/WorkspaceModeChips";
import { ItemFilters } from "@/features/items/ItemFilters";
import { filterItems, itemsEmptyState } from "@/lib/items";
import Link from "next/link";

interface ItemsPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; unnamed?: string }>;
}

export default async function ItemsPage({ params, searchParams: searchParamsPromise }: ItemsPageProps) {
  const { id } = await params;
  const searchParams = await searchParamsPromise;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);

  const items = await ItemController.fromDb(db).listItems(collection.id);
  const covers = await PhotoController.fromDb(db).findCoverPhotosByItemIds(
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
    <AppLayout breadcrumbs={trail.items(collection)}>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl text-ink sm:text-3xl">Items</h1>
            <p className="text-ink-soft mt-2">
              {items.length} {items.length === 1 ? "item" : "items"} in collection
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
            <Link href={`/collections/${collection.slug ?? collection.id}/pool`} className="min-w-0">
              <Button variant="secondary" className="w-full">
                Add photos
              </Button>
            </Link>
            <Link href={`/collections/${collection.slug ?? collection.id}/items/new`} className="min-w-0">
              <Button className="w-full">Add item</Button>
            </Link>
          </div>
        </div>

        {/* Section index, not the workspace root: Build is the current section,
            not the current page — hence activeExact={false}. */}
        <WorkspaceModeChips
          base={`/collections/${collection.slug ?? collection.id}`}
          activeMode="build"
          activeExact={false}
        />

        <ItemFilters activeFilter={activeFilter} unnamed={unnamed} collectionId={collection.slug ?? collection.id} />

        {filteredItems.length === 0 ? (
          <EmptyState
            heading={empty.heading}
            message={empty.message}
            action={
              items.length === 0
                ? { label: "Add item", href: `/collections/${collection.slug ?? collection.id}/items/new` }
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filteredItems.map((item) => {
              const cover = covers.get(item.id);
              return (
                <ItemCard
                  key={item.id}
                  item={item}
                  collectionId={collection.slug ?? collection.id}
                  heroPhotoUrl={cover ? getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.card }) : undefined}
                  viewerPhoto={
                    cover && cover.itemId
                      ? {
                          id: cover.id,
                          itemId: cover.itemId,
                          collectionId: cover.collectionId,
                          rotation: cover.rotation,
                          updatedAt: cover.updatedAt,
                        }
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
