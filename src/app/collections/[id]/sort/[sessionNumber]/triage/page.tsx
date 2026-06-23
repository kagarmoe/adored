import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { SessionController } from "@/server/api/sessions";
import { PreferenceController } from "@/server/api/preferences";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
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

  const sessionNumber = Number(params.sessionNumber);
  const [items, sortSession, preferences] = await Promise.all([
    ItemController.fromDb(db).listItems(collection.id),
    sessionNumber > 0 && Number.isInteger(sessionNumber)
      ? SessionController.fromDb(db).getByCollectionAndNumber(collection.id, sessionNumber)
      : Promise.resolve(null),
    PreferenceController.fromDb(db).listItemPreferences(collection.id, session.user.id),
  ]);

  if (!sortSession || sortSession.collectionId !== collection.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }

  // purses-t9l: each user sorts independently — only the session's curator may triage it.
  if (sortSession.curatorId !== session.user.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }

  const preferencesByItemId = new Map(preferences.map((p) => [p.itemId, p]));
  const item = items.find((i) => !preferencesByItemId.has(i.id)) || null;

  const covers = item ? await PhotoController.fromDb(db).findCoverPhotosByItemIds([item.id]) : new Map();
  const cover = item ? covers.get(item.id) : undefined;
  const heroPhotoUrl = cover ? getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.card }) : undefined;

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
                key={item.id}
                sessionId={sortSession.id}
                type="triage"
                decisions={[
                  { label: "Love", decision: { itemId: item.id, result: "top" } },
                  { label: "Like", decision: { itemId: item.id, result: "high" } },
                  { label: "Maybe", decision: { itemId: item.id, result: "medium" } },
                  { label: "Onward", decision: { itemId: item.id, result: "low" } },
                ]}
              />
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
