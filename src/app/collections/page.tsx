import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionController } from "@/server/api/collections";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { buttonVariants, EmptyState } from "@/components/ui";
import { CollectionCard } from "@/features/collections/CollectionCard";
import { CollectionFilters } from "@/features/collections/CollectionFilters";
import Link from "next/link";

interface CollectionsPageProps {
  searchParams?: { status?: string };
}

export default async function CollectionsPage({ searchParams }: CollectionsPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  // Access boundary: listCollections scopes to the authenticated user; every
  // downstream batch read is keyed off THESE ids, so pool state for a collection
  // the user can't see is never queried or exposed.
  const collections = await CollectionController.fromDb(db).listCollections(session.user.id);
  const collectionIds = collections.map((c) => c.id);
  const photoController = PhotoController.fromDb(db);
  const covers = await photoController.findCoverPhotosByCollectionIds(collectionIds);
  const collectionsWithPooledPhotos =
    await photoController.findCollectionIdsWithPooledPhotos(collectionIds);
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
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl text-ink">Your collections</h1>
            <p className="text-ink-soft mt-2">The things you&rsquo;re deciding about, gathered in one calm place.</p>
          </div>
          <Link href="/collections/new" className={`${buttonVariants()} shrink-0`}>
            New collection
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
              href: "/collections/new",
            }}
          />
        ) : filteredCollections.length === 0 ? (
          <EmptyState
            heading={activeFilter === "archived" ? "Nothing archived" : "Nothing active right now"}
            message="Try a different view above."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
