import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { getPhotoAssetUrlForPhoto } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { Card, EmptyState } from "@/components/ui";
import { DecisionControls } from "@/features/sorting/DecisionControls";
import { ItemCard } from "@/features/items/ItemCard";

interface TriagePageProps {
  params: { id: string; sessionNumber: string };
}

export default async function TriagePage({ params }: TriagePageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const itemRepo = new ItemRepository(db);
  const sessionRepo = new SessionRepository(db);
  const prefRepo = new CollectionPreferenceItemRepository(db);

  const sessionNumber = Number(params.sessionNumber);
  const [items, sortSession, preferences] = await Promise.all([
    itemRepo.findByCollection(collection.id),
    sessionNumber > 0 && Number.isInteger(sessionNumber)
      ? sessionRepo.findByCollectionAndNumber(collection.id, sessionNumber)
      : Promise.resolve(null),
    prefRepo.findByCollection(collection.id, session.user.id),
  ]);

  if (!sortSession || sortSession.collectionId !== collection.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }

  const preferencesByItemId = new Map(preferences.map((p) => [p.itemId, p]));
  const item = items.find((i) => !preferencesByItemId.has(i.id)) || null;

  const photoRepo = new PhotoRepository(db);
  const covers = item ? await photoRepo.findCoverPhotosByItemIds([item.id]) : new Map();
  const cover = item ? covers.get(item.id) : undefined;
  const heroPhotoUrl = cover ? getPhotoAssetUrlForPhoto(cover, collection.id) : undefined;

  const totalItems = items.length;
  const triaged = preferences.length;

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Session", href: `/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}` },
        { label: "Triage" },
      ]}
    >
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl text-ink">Triage</h1>
            <p className="mt-2 text-ink-soft">Assign the current item to a preference bucket.</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-ink-soft">{triaged} of {totalItems}</p>
            <div className="mt-2 w-32 bg-accent-aqua rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${totalItems > 0 ? (triaged / totalItems) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {!item ? (
          <EmptyState heading="All items triaged!" message="You&apos;ve completed triage for all items. View results to see your ranked order." />
        ) : (
          <>
            <ItemCard item={item} collectionId={collection.slug ?? collection.id} heroPhotoUrl={heroPhotoUrl} imageClassName="h-64" />
            <Card padding="lg">
              <DecisionControls
                sessionId={sortSession.id}
                type="triage"
                decisions={[
                  { label: "Love", decision: { itemId: item.id, result: "top" } },
                  { label: "Like", decision: { itemId: item.id, result: "high" } },
                  { label: "Maybe", decision: { itemId: item.id, result: "medium" } },
                  { label: "Release", decision: { itemId: item.id, result: "low" } },
                ]}
              />
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
