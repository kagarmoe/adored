import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { SessionController } from "@/server/api/sessions";
import { PreferenceController } from "@/server/api/preferences";
import { DispositionController } from "@/server/api/dispositions";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { Card, EmptyState } from "@/components/ui";
import { DecisionControls } from "@/features/sorting/DecisionControls";
import { DeferControl } from "@/features/sorting/DeferControl";
import { ItemCard } from "@/features/items/ItemCard";
import { selectTriageItem } from "@/lib/triage-selection";

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
  const [items, sortSession, preferences, dispositions] = await Promise.all([
    ItemController.fromDb(db).listItems(collection.id),
    sessionNumber > 0 && Number.isInteger(sessionNumber)
      ? SessionController.fromDb(db).getByCollectionAndNumber(collection.id, sessionNumber)
      : Promise.resolve(null),
    PreferenceController.fromDb(db).listItemPreferences(collection.id, session.user.id),
    DispositionController.fromDb(db).listDispositions(collection.id, session.user.id),
  ]);

  if (!sortSession || sortSession.collectionId !== collection.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }

  // purses-t9l: each user sorts independently — only the session's curator may triage it.
  if (sortSession.curatorId !== session.user.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }

  const preferenceItemIds = new Set(preferences.map((p) => p.itemId));
  const dispositionByItemId = new Map(dispositions.map((d) => [d.itemId, d.disposition]));
  const { item, showingDeferred } = selectTriageItem(items, preferenceItemIds, dispositionByItemId);

  const covers = item ? await PhotoController.fromDb(db).findCoverPhotosByItemIds([item.id]) : new Map();
  const cover = item ? covers.get(item.id) : undefined;
  const heroPhotoUrl = cover ? getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.card }) : undefined;

  // Ceiling-free cue: count only what the person has affirmed (TONE.md 1 & 4).
  // Never a total, a remaining count, or a filling-to-100% bar — no count-down,
  // no completion guilt.
  const decided = preferences.length;

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
        <div>
          <h1 className="text-3xl text-ink">How do you feel about this one?</h1>
          {decided > 0 && (
            <p className="mt-2 text-sm text-ink-soft">{decided} decided so far</p>
          )}
        </div>

        {!item ? (
          <EmptyState heading="You&apos;ve looked at everything for now" message="You&apos;ve thought through each one. View results to see what you love most." />
        ) : (
          <>
            {showingDeferred && (
              <div className="flex items-center gap-2 rounded-control bg-accent-cornflower px-4 py-3 text-ink transition-opacity duration-300 ease-gentle motion-reduce:transition-none">
                <span aria-hidden className="text-lg leading-none">☾</span>
                <p className="text-sm">
                  <span className="font-medium">Ready when you are.</span>{" "}
                  This one was waiting for you — no rush.
                </p>
              </div>
            )}
            <ItemCard item={item} collectionId={collection.slug ?? collection.id} heroPhotoUrl={heroPhotoUrl} imageClassName="h-64" />
            <Card padding="lg">
              <div className="space-y-4">
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
                {/* Quiet, demoted escape: the four tiers stay the primary row;
                    "Not yet" sits below a hairline as a low-pressure exit. */}
                <div className="border-t border-hairline pt-3">
                  <DeferControl collectionId={collection.id} itemId={item.id} />
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
