import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { PhotoController } from "@/server/api/photos";
import { ItemController } from "@/server/api/items";
import { SessionController } from "@/server/api/sessions";
import { PreferenceController } from "@/server/api/preferences";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { ActionBar } from "@/components/layout/ActionBar";
import { trail } from "@/components/layout/breadcrumb-trails";
import { Button, EmptyState, Input, buttonVariants } from "@/components/ui";
import { viewHref } from "@/components/ui/viewHref";
import { KeepSortingButton } from "@/features/sessions/KeepSortingButton";
import { PhotoPoolPreview } from "@/features/collections/PhotoPoolPreview";
import { WorkspaceModeChips } from "@/features/collections/WorkspaceModeChips";
import { CollectionHomeMenu } from "@/features/collections/CollectionHomeMenu";
import { ItemCard } from "@/features/items/ItemCard";
import { ArchivedItemCard } from "@/features/items/ArchivedItemCard";
import { ArchivedNotice } from "@/features/items/ArchivedNotice";
import { ItemFilterPills, type ItemsView } from "@/features/items/ItemFilterPills";
import { filterItems, itemsEmptyState } from "@/lib/items";
import { isIdShaped } from "@/lib/id";
import { queryFrom } from "@/lib/searchParam";
import { quietLink } from "@/lib/design/quiet-link";
import Link from "next/link";

type Param = string | string[] | undefined;

interface CollectionPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ status?: Param; unnamed?: Param; removed?: Param; q?: Param }>;
}

export default async function CollectionPage({ params, searchParams: searchParamsPromise }: CollectionPageProps) {
  const { id } = await params;
  const searchParams = await searchParamsPromise;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  // Access is enforced BEFORE any read — a thrown redirect here means nothing below runs.
  const collection = await requireCollectionAccess(db, id, session.user.id);

  const view: ItemsView =
    searchParams?.status === "archived" ? "archived" : searchParams?.unnamed === "1" ? "unnamed" : "all";
  const q = queryFrom(searchParams?.q);
  const itemController = ItemController.fromDb(db);
  // One round-trip. A failed read PROPAGATES (never caught into [] and shown as empty).
  // Archived items are always read (this collection's only): they verify ?removed= and
  // tell "nothing yet" from "everything archived".
  const [pool, liveItems, archivedItems, sessions, preferences] = await Promise.all([
    PhotoController.fromDb(db).findPoolByCollection(collection.id, 6),
    itemController.listItems(collection.id, { orderBy: "number" }),
    itemController.listArchived(collection.id),
    SessionController.fromDb(db).listByCollectionAndCurator(collection.id, session.user.id),
    PreferenceController.fromDb(db).listItemPreferences(collection.id, session.user.id),
  ]);
  const items = view === "archived" ? archivedItems : liveItems;
  const visible = filterItems(items, { unnamed: view === "unnamed", q });
  const covers =
    visible.length > 0
      ? await PhotoController.fromDb(db).findCoverPhotosByItemIds(visible.map((i) => i.id))
      : new Map();
  const coverUrl = (itemId: string) => {
    const c = covers.get(itemId);
    return c ? getPhotoAssetUrlForPhoto(c, collection.id, { w: PHOTO_WIDTH.card }) : undefined;
  };
  const tierByItem = new Map(preferences.map((p) => [p.itemId, p.rankBucket]));

  const base = `/collections/${collection.slug ?? collection.id}`;
  const poolHref = `${base}/pool`;
  // purses-t9l: each user sorts independently. A paused sort is still the current one.
  const currentSession = sessions.find((s) => s.status === "active" || s.status === "paused");
  // Something to see on the Ranking: a placed piece, or a sort finished before.
  const hasEverSorted = preferences.length > 0 || sessions.some((s) => s.status === "completed");
  const canSort = liveItems.length > 0 || currentSession !== undefined;
  const showPool = pool.length > 0 && view === "all" && !q;
  // The archive undo (purses-v7gv): only for an id-shaped value that IS an archived item
  // of THIS collection — a stale, foreign or hostile ?removed= renders nothing.
  const removed = searchParams?.removed;
  const justArchived =
    view !== "archived" && isIdShaped(removed) && archivedItems.some((i) => i.id === removed) ? removed : null;
  const empty = itemsEmptyState({ hasAnyItems: items.length > 0, hasArchived: archivedItems.length > 0, view, q });
  const poolOnly = showPool && liveItems.length === 0;

  return (
    <AppLayout breadcrumbs={trail.collection(collection)} reserveActionBar>
      {/* Tighter on phone so a card row shows above the fold at 390×664. */}
      <div className="space-y-4 md:space-y-8">
        {/* The header group: title, ···, and the chip row held together; the action row breaks after it. */}
        <div className="space-y-2">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0 max-w-3xl">
              {/* tabIndex -1: ArchivedNotice hands focus here as it unmounts. */}
              <h1 tabIndex={-1} className="text-2xl text-ink outline-hidden sm:text-3xl">{collection.name}</h1>
              {collection.description && <p className="mt-2 text-ink-soft">{collection.description}</p>}
            </div>
            <CollectionHomeMenu href={base} name={collection.name} isOwner={collection.ownerId === session.user.id} />
          </header>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <WorkspaceModeChips base={base} activeMode="build" />
            {hasEverSorted && (
              <Link href={`${base}/results`} className={`${quietLink} max-md:hidden`}>
                See your ranking
              </Link>
            )}
          </div>
        </div>

        {/* Spec §5: the one primary action, Add photos beside it. Start sorting needs
            something to sort; before that the primary is the way to items. */}
        <ActionBar label="Next step">
          {canSort ? (
            <KeepSortingButton
              fullWidth
              collectionId={collection.id}
              curatorId={session.user.id}
              sortHref={`${base}/sort`}
              session={
                currentSession
                  ? { id: currentSession.id, status: currentSession.status as "active" | "paused" }
                  : null
              }
            />
          ) : (
            <Link href={poolHref} className={buttonVariants()}>
              {pool.length > 0 ? "Make items" : "Add photos"}
            </Link>
          )}
          {canSort && (
            <Link href={poolHref} className={buttonVariants({ variant: "secondary" })}>
              Add photos
            </Link>
          )}
        </ActionBar>

        {justArchived && <ArchivedNotice kind="item" id={justArchived} />}

        {showPool && (
          <PhotoPoolPreview
            collectionId={collection.id}
            poolHref={poolHref}
            photos={pool.map((p) => ({ id: p.id }))}
            showLink={canSort}
          />
        )}

        {/* Nothing to search or filter until an item exists, live or archived. */}
        {liveItems.length + archivedItems.length > 0 && (
          <div className="space-y-4">
            <form role="search" action={base} className="flex items-end gap-2">
              {view === "archived" && <input type="hidden" name="status" value="archived" />}
              {view === "unnamed" && <input type="hidden" name="unnamed" value="1" />}
              <div className="w-full">
                {/* Visually hidden below md (above-the-fold room); the accessible name stays. */}
                <label htmlFor="home-search" className="mb-2 block text-sm font-medium text-ink max-md:sr-only">
                  Search your items
                </label>
                <Input
                  id="home-search"
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Name, brand, color…"
                  maxLength={100}
                />
              </div>
              <Button type="submit" variant="secondary" className="h-12">
                Search
              </Button>
            </form>
            <ItemFilterPills path={base} view={view} q={q} />
          </div>
        )}

        {visible.length > 0 ? (
          <ul aria-label="Your items" className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((item) => (
              <li key={item.id}>
                {view === "archived" ? (
                  <ArchivedItemCard item={item} coverUrl={coverUrl(item.id)} />
                ) : (
                  <ItemCard
                    item={item}
                    collectionId={collection.slug ?? collection.id}
                    heroPhotoUrl={coverUrl(item.id)}
                    bucket={tierByItem.get(item.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          !poolOnly && (
            <div className="flex flex-col items-center">
              <EmptyState heading={empty.heading} message={empty.message} />
              {q && (
                <Link href={viewHref(base, view, "")} className={quietLink}>
                  Clear search
                </Link>
              )}
            </div>
          )
        )}
      </div>
    </AppLayout>
  );
}
