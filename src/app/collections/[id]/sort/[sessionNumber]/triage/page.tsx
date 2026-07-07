import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { SessionController } from "@/server/api/sessions";
import { PreferenceController } from "@/server/api/preferences";
import { DecisionController } from "@/server/api/decisions";
import { DispositionController } from "@/server/api/dispositions";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { TriageUndoProvider } from "@/features/sorting/TriageUndoProvider";
import { TriageUndoNotice } from "@/features/sorting/TriageUndoNotice";
import { TakeABreakControl } from "@/features/sorting/TakeABreakControl";
import { TriageRound } from "@/features/sorting/TriageRound";
import { selectTriageQueue } from "@/lib/triage-selection";

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
  // The WHOLE eligible remainder (spec §3.3/F6): the client round advances
  // through it locally — no per-decision refresh, no mid-round refetch.
  const queueEntries = selectTriageQueue(items, preferenceItemIds, dispositionByItemId);

  // Round recap data: this session's decisions (server-time createdAt). The client
  // round merges its own tap log over this and filters to the round window.
  const decisions = await DecisionController.fromDb(db).listBySession(sortSession.id);

  const covers =
    queueEntries.length > 0
      ? await PhotoController.fromDb(db).findCoverPhotosByItemIds(queueEntries.map((e) => e.item.id))
      : new Map();
  const queue = queueEntries.map(({ item, deferred }) => {
    const cover = covers.get(item.id);
    return {
      item,
      deferred,
      heroPhotoUrl: cover
        ? getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.card })
        : undefined,
    };
  });

  const slugOrId = collection.slug ?? collection.id;
  const hubHref = `/collections/${slugOrId}/sort/${sortSession.number}`;

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${slugOrId}` },
        { label: "Session", href: hubHref },
        { label: "Triage" },
      ]}
      actions={
        <TakeABreakControl sessionId={sortSession.id} collectionHref={`/collections/${slugOrId}`} />
      }
    >
      <TriageUndoProvider
        curatorId={session.user.id}
        sessionId={sortSession.id}
        collectionId={collection.id}
      >
        {/* The set-aside undo notice lives OUTSIDE the round so it survives BOTH
            the queue emptying AND the round-end recap — setting aside the LAST
            item ends the round, but the "Bring back" escape must still be
            reachable (spec §11; TONE: nothing lost, always undoable). */}
        <div className="mx-auto max-w-xl">
          <TriageUndoNotice />
        </div>
        <TriageRound
          curatorId={session.user.id}
          sessionId={sortSession.id}
          collectionId={collection.id}
          collectionSlugOrId={slugOrId}
          queue={queue}
          decisions={decisions}
          decidedSeed={preferences.length}
          hubHref={hubHref}
          setAsideHref={`/collections/${slugOrId}/sort/set-aside`}
        />
      </TriageUndoProvider>
    </AppLayout>
  );
}
