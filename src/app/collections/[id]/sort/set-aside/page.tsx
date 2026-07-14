import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { DispositionController } from "@/server/api/dispositions";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { Card, CardImage, EmptyState } from "@/components/ui";
import { BringBackControl } from "@/features/sorting/BringBackControl";

interface SetAsidePageProps {
  params: Promise<{ id: string }>;
}

export default async function SetAsidePage({ params }: SetAsidePageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);

  // The page's data path: the curator's set-aside dispositions, the matching
  // item details, and each item's cover photo. Curator-scoped + disposition-
  // filtered at the controller; the page only joins the three.
  const dispositions = await DispositionController.fromDb(db).listDispositions(
    collection.id,
    session.user.id,
    "set_aside",
  );
  const setAsideItemIds = new Set(dispositions.map((d) => d.itemId));

  const allItems = await ItemController.fromDb(db).listItems(collection.id);
  const items = allItems.filter((i) => setAsideItemIds.has(i.id));
  const covers =
    items.length > 0
      ? await PhotoController.fromDb(db).findCoverPhotosByItemIds(items.map((i) => i.id))
      : new Map();

  const collectionHref = `/collections/${collection.slug ?? collection.id}`;

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: collectionHref },
        { label: "Set aside" },
      ]}
    >
      <div className="mx-auto w-full max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl text-ink sm:text-3xl">Set aside</h1>
          {/* Person-side framing, no count: these are the ones that weren't yours
              to decide. Bring any back whenever it feels right (TONE.md 1 & 4). */}
          <p className="mt-2 text-sm text-ink-soft">
            The ones you decided weren&apos;t yours. Bring any back whenever you like.
          </p>
        </div>

        {items.length === 0 ? (
          <EmptyState
            heading="Nothing set aside"
            message="When something isn&apos;t yours to decide, it waits here — gently, until you want it back."
          />
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const cover = covers.get(item.id);
              const coverUrl = cover
                ? getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.poolTile })
                : undefined;
              return (
                <li key={item.id}>
                  <Card padding="md">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      {/* CardImage degrades to the calm ☾ fallback on a missing
                          OR failed cover load — never the browser's broken glyph
                          (gentle by duty of care). unoptimized so auth cookies
                          reach the protected /file route. */}
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-control">
                        <CardImage
                          src={coverUrl}
                          alt=""
                          fallback={
                            <div
                              aria-hidden
                              className="flex h-full w-full items-center justify-center bg-content-soft text-2xl text-ink-soft"
                            >
                              ☾
                            </div>
                          }
                        />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-base text-ink">
                        {item.name ?? "This one"}
                      </span>
                      {/* ULID (collection.id), never the slug — the dispositions
                          API asserts item.collectionId matches the route id. */}
                      <BringBackControl collectionId={collection.id} itemId={item.id} />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
