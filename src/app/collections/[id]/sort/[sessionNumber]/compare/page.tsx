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
import { PendingDecisionsGate } from "@/features/sorting/PendingDecisionsGate";
import { PendingNotices } from "@/features/sorting/pendingNotices";
import { COMPARE_SUBLINE } from "@/features/sorting/roundCopy";
import { RoundSurface } from "@/features/sorting/RoundSurface";
import { TakeABreakControl } from "@/features/sorting/TakeABreakControl";
import { selectNextPair } from "@/lib/pairwise-selection";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";

interface ComparePageProps {
  params: Promise<{ id: string; sessionNumber: string }>;
}

export default async function ComparePage({ params }: ComparePageProps) {
  const { id, sessionNumber: sessionNumberParam } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);

  const sessionNumber = Number(sessionNumberParam);
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
      curatorId={session.user.id}
      sessionId={sortSession.id}
      collectionHref={`/collections/${collection.slug ?? collection.id}`}
    />
  );

  const [items, preferences, curatorDecisions, dispositions] = await Promise.all([
    ItemController.fromDb(db).listItems(collection.id),
    PreferenceController.fromDb(db).listItemPreferences(collection.id, session.user.id),
    // ONE curator-wide read (§2.6/§7.3, Task-21 pattern): compare selection reads the
    // same cross-session log the recompute does, so a pair ordered in a prior session
    // isn't re-asked. The session-scoped subset below drives the recap + gentle count.
    DecisionController.fromDb(db).listForCurator(collection.id, sortSession.curatorId),
    DispositionController.fromDb(db).listDispositions(collection.id, session.user.id),
  ]);

  // Session-scoped subset for the recap + comparison count. The curator guard above
  // makes the curator log a strict superset, so this equals the retired listBySession.
  const decisions = curatorDecisions.filter((e) => e.sessionId === sortSession.id);

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
        <PendingDecisionsGate curatorId={session.user.id}>
          <EmptyState
            heading="Not enough items"
            message="Add more items to the collection to use pairwise comparison"
          />
        </PendingDecisionsGate>
      </AppLayout>
    );
  }

  // Gentle, non-gamified count of comparisons MADE (never a remaining/total ceiling).
  // Computed before the branch so it survives into the completion state — the "all
  // comparisons complete" screen still affirms the work done, not just an empty end.
  const comparisonsMade = decisions.filter((d) => d.type === "pairwise_compare").length;

  // Curator-wide log so the offered pair agrees with the recompute (§7.3).
  const pair = selectNextPair({
    preferences,
    items,
    decisions: curatorDecisions,
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
        {/* "All complete" is derived from the decision log — gate it too, or a
            crash-reload could claim completion over undrained decisions. */}
        <PendingDecisionsGate curatorId={session.user.id}>
          <EmptyState
            heading="All comparisons complete"
            message="You&apos;ve compared the pairs this round can offer. Check your results!"
          />
          {comparisonsMade > 0 && (
            <p className="mt-4 text-center text-sm text-ink-soft">
              {comparisonsMade} {comparisonsMade === 1 ? "comparison" : "comparisons"} made so far
            </p>
          )}
        </PendingDecisionsGate>
      </AppLayout>
    );
  }

  const [itemA, itemB] = pair;
  const covers = await PhotoController.fromDb(db).findCoverPhotosByItemIds([itemA.id, itemB.id]);
  const coverA = covers.get(itemA.id);
  const coverB = covers.get(itemB.id);
  const heroA = coverA ? getPhotoAssetUrlForPhoto(coverA, collection.id, { w: PHOTO_WIDTH.card }) : undefined;
  const heroB = coverB ? getPhotoAssetUrlForPhoto(coverB, collection.id, { w: PHOTO_WIDTH.card }) : undefined;

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
      {/* Recovery gate (spec §3.4): the pair below was selected from the server
          decision log — pending decisions must drain before it can be trusted. */}
      <PendingDecisionsGate curatorId={session.user.id}>
      <RoundSurface
        step={3}
        totalSteps={4}
        roundLabel="Comparing"
        decisions={decisions}
        hubHref={`/collections/${collection.slug ?? collection.id}/sort/${sortSession.number}`}
      >
        <div className="mx-auto max-w-2xl space-y-6">
          {/* The flush engine's one quiet voice on this surface — a rejected
              batch-of-1 ack surfaces here, never as an error (spec §3.2/F9). */}
          <PendingNotices />
          <div>
            <h1 className="text-2xl text-ink sm:text-3xl">Which do you love more?</h1>
            <p className="mt-2 text-ink-soft">{COMPARE_SUBLINE}</p>
          </div>

          {!itemA || !itemB ? (
            <EmptyState heading="Need at least two items" message="Add more items to use pairwise comparison" />
          ) : (
            <CompareChoice
              submit={{
                kind: "session",
                sessionId: sortSession.id,
                curatorId: session.user.id,
                collectionId: collection.id,
              }}
              itemA={itemA}
              itemB={itemB}
              heroA={heroA}
              heroB={heroB}
              comparisonsMade={comparisonsMade}
            />
          )}
        </div>
      </RoundSurface>
      </PendingDecisionsGate>
    </AppLayout>
  );
}
