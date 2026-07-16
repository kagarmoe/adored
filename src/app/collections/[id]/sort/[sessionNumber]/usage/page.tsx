import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { SessionController } from "@/server/api/sessions";
import { DecisionController } from "@/server/api/decisions";
import { DispositionController } from "@/server/api/dispositions";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { TakeABreakControl } from "@/features/sorting/TakeABreakControl";
import { UsageRound } from "@/features/sorting/UsageRound";
import { PendingDecisionsGate } from "@/features/sorting/PendingDecisionsGate";
import { selectUsageQueue } from "@/lib/usage-selection";
import { deriveUsage } from "@/lib/derive-usage";

interface UsagePageProps {
  params: Promise<{ id: string; sessionNumber: string }>;
}

export default async function UsagePage({ params }: UsagePageProps) {
  const { id, sessionNumber: sessionNumberParam } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);

  const sessionNumber = Number(sessionNumberParam);
  // One decision-log read (spec §3.3/§2.6): the curator's WHOLE cross-session log,
  // consumed SERVER-SIDE ONLY (queue + seed). No listBySession, no preferences read.
  const [items, sortSession, dispositions, curatorEvents] = await Promise.all([
    ItemController.fromDb(db).listItems(collection.id),
    sessionNumber > 0 && Number.isInteger(sessionNumber)
      ? SessionController.fromDb(db).getByCollectionAndNumber(collection.id, sessionNumber)
      : Promise.resolve(null),
    DispositionController.fromDb(db).listDispositions(collection.id, session.user.id),
    DecisionController.fromDb(db).listForCurator(collection.id, session.user.id),
  ]);

  if (!sortSession || sortSession.collectionId !== collection.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }

  // purses-t9l: each user sorts independently — only the session's curator may run it.
  if (sortSession.curatorId !== session.user.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/sort`);
  }

  const dispositionByItemId = new Map(dispositions.map((d) => [d.itemId, d.disposition]));
  // Usage is derived at read time (no projection table): latest usage event per
  // live item wins. The queue is the eligible remainder — usage-unknown AND not
  // disposed (spec §3.2); its size seeds the answered-count cue.
  const usageByItemId = deriveUsage(curatorEvents, new Set(items.map((i) => i.id)));
  const queueItems = selectUsageQueue(items, usageByItemId, dispositionByItemId);

  const covers =
    queueItems.length > 0
      ? await PhotoController.fromDb(db).findCoverPhotosByItemIds(queueItems.map((i) => i.id))
      : new Map();
  const queue = queueItems.map((item) => {
    const cover = covers.get(item.id);
    return {
      item,
      heroPhotoUrl: cover
        ? getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.card })
        : undefined,
    };
  });

  const slugOrId = collection.slug ?? collection.id;
  const hubHref = `/collections/${slugOrId}/sort/${sortSession.number}`;

  return (
    <AppLayout
      breadcrumbs={trail.usage(collection, sortSession.number)}
      actions={
        <TakeABreakControl
          curatorId={session.user.id}
          sessionId={sortSession.id}
          collectionHref={`/collections/${slugOrId}`}
        />
      }
    >
      {/* Recovery gate (spec §3.4): the round snapshots the server-selected queue
          into client state at mount — it must never mount over undrained usage
          answers (conditional mount, never CSS-hide). */}
      <PendingDecisionsGate curatorId={session.user.id}>
        <div className="mx-auto w-full max-w-2xl">
          <UsageRound
            curatorId={session.user.id}
            sessionId={sortSession.id}
            collectionId={collection.id}
            collectionSlugOrId={slugOrId}
            queue={queue}
            // Server-side only: the curator log predates the round window
            // (whatMoved fixes the window at mount), so it can never contribute a
            // recap count — never serialized into the RSC payload (DATA-6).
            decisions={[]}
            usageKnownSeed={usageByItemId.size}
            hubHref={hubHref}
          />
        </div>
      </PendingDecisionsGate>
    </AppLayout>
  );
}
