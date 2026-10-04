import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { SessionController } from "@/server/api/sessions";
import { PreferenceController } from "@/server/api/preferences";
import { DecisionController } from "@/server/api/decisions";
import { DispositionController } from "@/server/api/dispositions";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { chooseSortPhase } from "@/lib/sort-phase";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { buttonVariants } from "@/components/ui";
import { quietLink } from "@/lib/design/quiet-link";
import { PendingDecisionsGate } from "@/features/sorting/PendingDecisionsGate";
import { TriageUndoProvider } from "@/features/sorting/TriageUndoProvider";
import { TriageUndoNotice } from "@/features/sorting/TriageUndoNotice";
import { TriageRound } from "@/features/sorting/TriageRound";
import { CompareChoice } from "@/features/sorting/CompareChoice";
import { SortProgress } from "@/features/sorting/SortProgress";
import { PauseControl } from "@/features/sorting/PauseControl";
import { ResumeOnLoad } from "@/features/sorting/ResumeOnLoad";
import { PendingNotices } from "@/features/sorting/pendingNotices";
import { SortDoneHeading } from "@/features/sorting/SortDoneHeading";
import { COMPARE_SUBLINE } from "@/features/sorting/roundCopy";
import { KeepSortingButton } from "@/features/sessions/KeepSortingButton";

interface SortPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ phase?: string }>;
}

/**
 * The one Sort screen (spec §4): feelings, then pairs over Love + Like, then a
 * quiet end. Reads only — every answer travels through the decision queue.
 */
export default async function SortPage({ params, searchParams }: SortPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const phase = query?.phase;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);
  const curatorId = session.user.id;
  const base = `/collections/${collection.slug ?? collection.id}`;
  const sortHref = `${base}/sort`;

  // purses-t9l: each person sorts independently — only this curator's sessions.
  const sessions = await SessionController.fromDb(db).listByCollectionAndCurator(collection.id, curatorId);
  const open = sessions.find((s) => s.status === "active" || s.status === "paused");

  if (!open) {
    return (
      <AppLayout breadcrumbs={trail.sort(collection)}>
        <section className="mx-auto max-w-xl space-y-4 text-center">
          <h1 className="font-display text-3xl text-ink">Ready when you are</h1>
          <p className="text-ink-soft">How you feel about each piece, then which you&rsquo;d reach for first.</p>
          <div className="flex justify-center">
            <KeepSortingButton collectionId={collection.id} curatorId={curatorId} sortHref={sortHref} session={null} />
          </div>
        </section>
      </AppLayout>
    );
  }

  const [items, preferences, dispositions, curatorDecisions] = await Promise.all([
    ItemController.fromDb(db).listItems(collection.id),
    PreferenceController.fromDb(db).listItemPreferences(collection.id, curatorId),
    DispositionController.fromDb(db).listDispositions(collection.id, curatorId),
    DecisionController.fromDb(db).listForCurator(collection.id, curatorId),
  ]);
  const sortPhase = chooseSortPhase({
    items,
    preferences,
    dispositionByItemId: new Map(dispositions.map((d) => [d.itemId, d.disposition])),
    curatorDecisions,
    deferredOffered: phase === "pairs",
  });

  // The hand-off line greets the first pair only: once a pair answer from this sort
  // has landed, a reload of ?phase=pairs no longer says "Now…".
  const handingOff =
    phase === "pairs" && !curatorDecisions.some((e) => e.sessionId === open.id && e.type === "pairwise_compare");

  const coverIds =
    sortPhase.kind === "feelings"
      ? sortPhase.queue.map((e) => e.item.id)
      : sortPhase.kind === "pairs"
        ? sortPhase.pair.map((i) => i.id)
        : [];
  const covers = coverIds.length > 0 ? await PhotoController.fromDb(db).findCoverPhotosByItemIds(coverIds) : new Map();
  const coverUrl = (itemId: string) => {
    const cover = covers.get(itemId);
    return cover ? getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.card }) : undefined;
  };

  return (
    <AppLayout
      breadcrumbs={trail.sort(collection)}
      actions={<PauseControl curatorId={curatorId} sessionId={open.id} collectionHref={base} />}
    >
      {open.status === "paused" && <ResumeOnLoad curatorId={curatorId} sessionId={open.id} />}
      {/* Recovery gate: queued answers land before this screen trusts the server's view. */}
      <PendingDecisionsGate curatorId={curatorId} collectionId={collection.id}>
        {/* The provider and notice sit ABOVE the phase switch so "Bring back" survives the hand-off. */}
        <TriageUndoProvider curatorId={curatorId} sessionId={open.id} collectionId={collection.id}>
          <div className="mx-auto max-w-xl space-y-6">
            <TriageUndoNotice />
            {sortPhase.kind === "feelings" && (
              <TriageRound
                // TriageRound seeds its state once; a new server queue (e.g. after the
                // hand-off, a piece still needs a feeling) must remount it.
                key={sortPhase.queue.map((e) => e.item.id).join(",")}
                curatorId={curatorId}
                sessionId={open.id}
                collectionId={collection.id}
                collectionSlugOrId={collection.slug ?? collection.id}
                queue={sortPhase.queue.map((e) => ({ ...e, heroPhotoUrl: coverUrl(e.item.id) }))}
                placedSeed={sortPhase.progress.done}
                nextHref={`${sortHref}?phase=pairs`}
              />
            )}
            {sortPhase.kind === "pairs" && (
              <div className="space-y-6">
                <SortProgress done={sortPhase.progress.done} total={sortPhase.progress.total} />
                <PendingNotices collectionId={collection.id} sessionId={open.id} />
                <div>
                  {handingOff && <p className="mb-2 text-ink-soft">Now, between these two…</p>}
                  <h1 className="text-2xl text-ink sm:text-3xl">Which would you reach for first?</h1>
                  <p className="mt-2 text-ink-soft">{COMPARE_SUBLINE}</p>
                </div>
                <CompareChoice
                  submit={{ kind: "session", sessionId: open.id, curatorId, collectionId: collection.id }}
                  itemA={sortPhase.pair[0]}
                  itemB={sortPhase.pair[1]}
                  heroA={coverUrl(sortPhase.pair[0].id)}
                  heroB={coverUrl(sortPhase.pair[1].id)}
                />
              </div>
            )}
            {sortPhase.kind === "done" && <PendingNotices collectionId={collection.id} sessionId={open.id} />}
            {sortPhase.kind === "done" ? (
              <section className="space-y-4 text-center">
                <SortDoneHeading>That&rsquo;s everything for now</SortDoneHeading>
                <Link href={`${base}/results`} className={buttonVariants({ size: "lg" })}>
                  See your ranking
                </Link>
              </section>
            ) : (
              // Spec §4.3: the Ranking is reachable from the Sort screen at any point.
              <p className="text-center">
                <Link href={`${base}/results`} className={quietLink}>
                  See your ranking so far
                </Link>
              </p>
            )}
          </div>
        </TriageUndoProvider>
      </PendingDecisionsGate>
    </AppLayout>
  );
}
