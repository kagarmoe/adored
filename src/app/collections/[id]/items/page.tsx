import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { PhotoController } from "@/server/api/photos";
import { PreferenceController } from "@/server/api/preferences";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { Button, EmptyState, Input } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { ArchivedItemCard } from "@/features/items/ArchivedItemCard";
import { ItemFilterPills, type ItemsView } from "@/features/items/ItemFilterPills";
import { RemovedItemNotice } from "@/features/items/RemovedItemNotice";
import { WorkspaceModeChips } from "@/features/collections/WorkspaceModeChips";
import { filterItems, itemsEmptyState } from "@/lib/items";
import Link from "next/link";

interface ItemsPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: string; unnamed?: string; removed?: string; q?: string }>;
}

const VIEW_LABEL: Record<ItemsView, string> = {
  all: "All",
  archived: "Archived",
  unnamed: "Waiting for a name",
};

export default async function ItemsPage({ params, searchParams: searchParamsPromise }: ItemsPageProps) {
  const { id } = await params;
  const searchParams = await searchParamsPromise;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);

  const collectionHref = `/collections/${collection.slug ?? collection.id}`;

  const view: ItemsView =
    searchParams?.status === "archived" ? "archived" : searchParams?.unnamed === "1" ? "unnamed" : "all";
  // typeof: a repeated ?q= key arrives as string[].
  const q = typeof searchParams?.q === "string" ? searchParams.q.slice(0, 100) : "";
  const controller = ItemController.fromDb(db);
  const [items, preferences] = await Promise.all([
    view === "archived" ? controller.listArchived(collection.id) : controller.listItems(collection.id),
    view === "archived" ? [] : PreferenceController.fromDb(db).listItemPreferences(collection.id, session.user.id),
  ]);
  const covers = await PhotoController.fromDb(db).findCoverPhotosByItemIds(items.map((i) => i.id));
  const tierByItem = new Map(preferences.map((p) => [p.itemId, p.rankBucket]));
  const visible = filterItems(items, { unnamed: view === "unnamed", q });
  const empty = itemsEmptyState({ hasAnyItems: items.length > 0, view, q });
  const coverUrl = (itemId: string) => {
    const c = covers.get(itemId);
    return c ? getPhotoAssetUrlForPhoto(c, collection.id, { w: PHOTO_WIDTH.card }) : undefined;
  };

  return (
    <AppLayout breadcrumbs={trail.items(collection)}>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl text-ink sm:text-3xl">{collection.name}</h1>
            <p className="mt-2 text-ink-soft">{VIEW_LABEL[view]}</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
            <Link href={`${collectionHref}/pool`} className="min-w-0">
              <Button variant="secondary" className="w-full">
                Add photos
              </Button>
            </Link>
            <Link href={`${collectionHref}/items/new`} className="min-w-0">
              <Button className="w-full">Add item</Button>
            </Link>
          </div>
        </div>

        {/* The undo half of item archiving (purses-v7gv), rides POST
            /api/items/[id]/restore. Guarded against a stale/bookmarked URL: if
            the id is in the live list the archive claim would be false — skip.
            Only checked on the live read (the Archived view lists it by design).
            (typeof check: a repeated ?removed= key arrives as string[].) */}
        {typeof searchParams?.removed === "string" &&
          view !== "archived" &&
          !items.some((i) => i.id === searchParams.removed) && (
            <RemovedItemNotice itemId={searchParams.removed} />
          )}

        {/* Section index, not the workspace root: Build is the current section,
            not the current page — hence activeExact={false}. */}
        <WorkspaceModeChips base={collectionHref} activeMode="build" activeExact={false} />

        <div className="space-y-4">
          <form role="search" action={`${collectionHref}/items`} className="flex items-end gap-2">
            {view === "archived" && <input type="hidden" name="status" value="archived" />}
            {view === "unnamed" && <input type="hidden" name="unnamed" value="1" />}
            <Input
              type="search"
              name="q"
              defaultValue={q}
              label="Search your items"
              placeholder="Name, brand, color…"
              maxLength={100}
            />
            <Button type="submit" variant="secondary" className="h-12">
              Search
            </Button>
          </form>
          <ItemFilterPills base={collectionHref} view={view} q={q} />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            heading={empty.heading}
            message={empty.message}
            action={
              items.length === 0 && view !== "archived"
                ? { label: "Add photos", href: `${collectionHref}/pool` }
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((item) =>
              view === "archived" ? (
                <ArchivedItemCard key={item.id} item={item} coverUrl={coverUrl(item.id)} />
              ) : (
                <ItemCard
                  key={item.id}
                  item={item}
                  collectionId={collection.slug ?? collection.id}
                  heroPhotoUrl={coverUrl(item.id)}
                  bucket={tierByItem.get(item.id)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
