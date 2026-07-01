import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { SessionController } from "@/server/api/sessions";
import { PreferenceController } from "@/server/api/preferences";
import { DecisionController } from "@/server/api/decisions";
import { DispositionController } from "@/server/api/dispositions";
import { AppLayout } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { CompareChoice } from "@/features/sorting/CompareChoice";
import { TakeABreakControl } from "@/features/sorting/TakeABreakControl";
import { selectNextPair } from "@/lib/pairwise-selection";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";

interface ComparePageProps {
  params: { id: string; sessionNumber: string };
}

export default async function ComparePage({ params }: ComparePageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);

  const sessionNumber = Number(params.sessionNumber);
  const sortSession =
    sessionNumber > 0 && Number.isInteger(sessionNumber)
      ? await SessionController.fromDb(db).getByCollectionAndNumber(collection.id, sessionNumber)
      : null;

  if (!sortSession || sortSession.collectionId !== collection.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }

  // purses-t9l: each user sorts independently — only the session's curator may compare in it.
  if (sortSession.curatorId !== session.user.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }

  // "Take a break" stays reachable in every state of the compare screen — even
  // the not-enough-items / all-done branches — so stepping away is never gated.
  const breakAction = (
    <TakeABreakControl
      sessionId={sortSession.id}
      collectionHref={`/collections/${collection.slug ?? collection.id}`}
    />
  );

  const [items, preferences, decisions, dispositions] = await Promise.all([
    ItemController.fromDb(db).listItems(collection.id),
    PreferenceController.fromDb(db).listItemPreferences(collection.id, session.user.id),
    DecisionController.fromDb(db).listBySession(sortSession.id),
    DispositionController.fromDb(db).listDispositions(collection.id, session.user.id),
  ]);

  // A disposed item (set_aside / deferred) is never offered for pairwise compare.
  const dispositionByItemId = new Map(dispositions.map((d) => [d.itemId, d.disposition]));

  if (items.length < 2) {
    return (
      <AppLayout
        breadcrumbs={[
          { label: "Collections", href: "/collections" },
          { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
          { label: "Session", href: `/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}` },
          { label: "Compare" },
        ]}
        actions={breakAction}
      >
        <EmptyState
          heading="Not enough items"
          message="Add more items to the collection to use pairwise comparison"
        />
      </AppLayout>
    );
  }

  const pair = selectNextPair({
    preferences,
    items,
    decisions,
    dispositionByItemId,
  });

  if (!pair) {
    return (
      <AppLayout
        breadcrumbs={[
          { label: "Collections", href: "/collections" },
          { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
          { label: "Session", href: `/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}` },
          { label: "Compare" },
        ]}
        actions={breakAction}
      >
        <EmptyState
          heading="All comparisons complete"
          message="You&apos;ve compared all meaningful pairs. Check your results!"
        />
      </AppLayout>
    );
  }

  const [itemA, itemB] = pair;
  const covers = await PhotoController.fromDb(db).findCoverPhotosByItemIds([itemA.id, itemB.id]);
  const coverA = covers.get(itemA.id);
  const coverB = covers.get(itemB.id);
  const heroA = coverA ? getPhotoAssetUrlForPhoto(coverA, collection.id, { w: PHOTO_WIDTH.card }) : undefined;
  const heroB = coverB ? getPhotoAssetUrlForPhoto(coverB, collection.id, { w: PHOTO_WIDTH.card }) : undefined;
  const comparisonsMade = decisions.filter((d) => d.type === "pairwise_compare").length;

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Session", href: `/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}` },
        { label: "Compare" },
      ]}
      actions={breakAction}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl text-ink">Which do you love more?</h1>
          <p className="mt-2 text-ink-soft">Tap the one you love more. Tie or skip whenever you like.</p>
        </div>

        {!itemA || !itemB ? (
          <EmptyState heading="Need at least two items" message="Add more items to use pairwise comparison" />
        ) : (
          <CompareChoice
            sessionId={sortSession.id}
            itemA={itemA}
            itemB={itemB}
            heroA={heroA}
            heroB={heroB}
            comparisonsMade={comparisonsMade}
          />
        )}
      </div>
    </AppLayout>
  );
}
