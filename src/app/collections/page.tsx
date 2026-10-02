import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { CollectionController } from "@/server/api/collections";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { ActionBar } from "@/components/layout/ActionBar";
import { trail } from "@/components/layout/breadcrumb-trails";
import { Button, EmptyState, FilterPills, Input, buttonVariants } from "@/components/ui";
import { CollectionCard } from "@/features/collections/CollectionCard";
import { CollectionCardMenu } from "@/features/collections/CollectionCardMenu";
import { BroughtBackNotice } from "@/features/collections/BroughtBackNotice";
import {
  COLLECTION_PILLS,
  collectionsEmptyState,
  collectionsViewFrom,
  collectionsViewHref,
  filterCollections,
} from "@/features/collections/collectionsList";
import { ArchivedNotice } from "@/features/items/ArchivedNotice";
import { DISMISS_KEY } from "@/features/onboarding/dismissal";
import { shouldShowWelcome } from "@/features/onboarding/gate";
import { isIdShaped } from "@/lib/id";
import { quietLink } from "@/lib/design/quiet-link";
import Link from "next/link";

type Param = string | string[] | undefined;

interface CollectionsPageProps {
  searchParams?: Promise<{ status?: Param; q?: Param; removed?: Param; restored?: Param }>;
}

export default async function CollectionsPage(props: CollectionsPageProps) {
  const searchParams = await props.searchParams;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;
  const db = getDb();
  // Access boundary: listCollections scopes to the authenticated user; every
  // downstream batch read is keyed off THESE ids, so pool state for a collection
  // the user can't see is never queried or exposed.
  const collections = await CollectionController.fromDb(db).listCollections(userId);

  // First-run gate (the ONE place it lives): zero collections AND the walkthrough
  // not dismissed -> /welcome before rendering. Dismissal is a cookie the server reads.
  const dismissed = (await cookies()).get(DISMISS_KEY)?.value === "1";
  if (shouldShowWelcome(collections.length, dismissed)) {
    redirect("/welcome");
  }

  const view = collectionsViewFrom(searchParams?.status);
  // typeof: a repeated ?q= key arrives as string[] — ignore it.
  const q = typeof searchParams?.q === "string" ? searchParams.q.slice(0, 100) : "";
  const visible = filterCollections(collections, { view, q });
  const empty = collectionsEmptyState({ hasAny: collections.length > 0, view, q });
  const visibleIds = visible.map((c) => c.id);
  const photoController = PhotoController.fromDb(db);
  const [covers, pooled] = await Promise.all([
    photoController.findCoverPhotosByCollectionIds(visibleIds),
    photoController.findCollectionIdsWithPooledPhotos(visibleIds),
  ]);
  // The undo / brought-back lines only for one of the viewer's OWN collections in the
  // matching state right now — a stale, restored, shared, foreign or junk id renders nothing.
  const ownIn = (param: Param, archived: boolean) =>
    isIdShaped(param) &&
    collections.some((c) => c.id === param && c.ownerId === userId && (c.status === "archived") === archived)
      ? param
      : null;
  const justArchived = ownIn(searchParams?.removed, true);
  const broughtBack = ownIn(searchParams?.restored, false);

  return (
    <AppLayout breadcrumbs={trail.collections()} reserveActionBar>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-2xl text-ink sm:text-3xl">Your collections</h1>
            <p className="mt-2 text-ink-soft">The things you&rsquo;re deciding about, gathered in one calm place.</p>
          </div>
          <ActionBar label="Next step">
            <Link href="/collections/new" className={`${buttonVariants()} w-full md:w-auto`}>
              New collection
            </Link>
          </ActionBar>
        </div>

        {justArchived && <ArchivedNotice kind="collection" id={justArchived} />}
        {broughtBack && <BroughtBackNotice />}

        <div className="space-y-4">
          <form role="search" action="/collections" className="flex items-end gap-2">
            {view === "archived" && <input type="hidden" name="status" value="archived" />}
            <Input
              type="search"
              name="q"
              defaultValue={q}
              label="Search your collections"
              placeholder="Name or description…"
              maxLength={100}
            />
            <Button type="submit" variant="secondary" className="h-12">
              Search
            </Button>
          </form>
          <FilterPills
            label="Filter collections"
            pills={COLLECTION_PILLS.map(([v, label]) => ({ label, href: collectionsViewHref(v, q), current: v === view }))}
          />
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center">
            <EmptyState heading={empty.heading} message={empty.message} />
            {q && (
              <Link href={collectionsViewHref(view, "")} className={quietLink}>
                Clear search
              </Link>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((collection) => {
              const cover = covers.get(collection.id);
              const href = `/collections/${collection.slug ?? collection.id}`;
              return (
                <li key={collection.id}>
                  <CollectionCard
                    collection={collection}
                    hasPooledPhotos={pooled.has(collection.id)}
                    coverPhotoUrl={cover ? getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.card }) : undefined}
                    menu={
                      collection.ownerId === userId ? (
                        <CollectionCardMenu
                          collectionId={collection.id}
                          name={collection.name}
                          href={href}
                          archived={collection.status === "archived"}
                          q={q}
                        />
                      ) : undefined
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
