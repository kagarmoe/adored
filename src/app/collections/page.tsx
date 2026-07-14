import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { CollectionController } from "@/server/api/collections";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { buttonVariants, EmptyState } from "@/components/ui";
import { CollectionCard } from "@/features/collections/CollectionCard";
import { CollectionFilters } from "@/features/collections/CollectionFilters";
import { DISMISS_KEY } from "@/features/onboarding/dismissal";
import { shouldShowWelcome } from "@/features/onboarding/gate";
import Link from "next/link";

interface CollectionsPageProps {
  searchParams?: Promise<{ status?: string }>;
}

export default async function CollectionsPage(props: CollectionsPageProps) {
  const searchParams = await props.searchParams;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  // Access boundary: listCollections scopes to the authenticated user; every
  // downstream batch read is keyed off THESE ids, so pool state for a collection
  // the user can't see is never queried or exposed.
  const collections = await CollectionController.fromDb(db).listCollections(session.user.id);

  // First-run gate (the ONE place it lives): zero collections AND the walkthrough
  // not dismissed -> redirect to /welcome BEFORE rendering, so a first-run user
  // never sees the collections chrome flash. Dismissal is a cookie so the server
  // can read it here; no DB, no client cover needed.
  const dismissed = (await cookies()).get(DISMISS_KEY)?.value === "1";
  if (shouldShowWelcome(collections.length, dismissed)) {
    redirect("/welcome");
  }

  const collectionIds = collections.map((c) => c.id);
  const photoController = PhotoController.fromDb(db);
  const [covers, collectionsWithPooledPhotos] = await Promise.all([
    photoController.findCoverPhotosByCollectionIds(collectionIds),
    photoController.findCollectionIdsWithPooledPhotos(collectionIds),
  ]);
  const activeFilter = searchParams?.status === "active" || searchParams?.status === "archived"
    ? searchParams.status
    : "all";
  const filteredCollections = activeFilter === "all"
    ? collections
    : collections.filter((collection) => collection.status === activeFilter);

  return (
    <AppLayout breadcrumbs={[{ label: "Collections" }]}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-2xl text-ink sm:text-3xl">Your collections</h1>
            <p className="text-ink-soft mt-2">The things you&rsquo;re deciding about, gathered in one calm place.</p>
          </div>
          <Link href="/collections/new" aria-label="Begin a collection" className={`${buttonVariants()} w-full shrink-0 sm:w-auto`}>
            <span className="sm:hidden">Begin</span>
            <span className="hidden sm:inline">New collection</span>
          </Link>
        </div>

        {/* Collections Grid */}
        <CollectionFilters activeFilter={activeFilter} />

        {collections.length === 0 ? (
          <EmptyState
            heading="Nothing here yet"
            message="Begin a collection whenever you’re ready — there’s no rush."
            action={{
              label: "Begin a collection",
              mobileLabel: "Begin",
              href: "/collections/new",
            }}
          />
        ) : filteredCollections.length === 0 ? (
          <EmptyState
            heading={activeFilter === "archived" ? "Nothing archived" : "Nothing active right now"}
            message="Try a different view above."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] sm:gap-6">
            {filteredCollections.map((collection) => {
              const cover = covers.get(collection.id);
              return (
                <CollectionCard
                  key={collection.id}
                  collection={collection}
                  hasPooledPhotos={collectionsWithPooledPhotos.has(collection.id)}
                  coverPhotoUrl={cover ? getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.card }) : undefined}
                  viewerPhoto={
                    cover && cover.itemId
                      ? {
                          id: cover.id,
                          itemId: cover.itemId,
                          collectionId: cover.collectionId,
                          rotation: cover.rotation,
                          updatedAt: cover.updatedAt,
                          alt: collection.name,
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
