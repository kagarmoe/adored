import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { ResultItemController } from "@/server/api/result-items";
import { ResultController } from "@/server/api/results";
import { ShareController } from "@/server/api/shares";
import { PhotoController } from "@/server/api/photos";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { Badge, EmptyState } from "@/components/ui";
import { RankedResults } from "@/features/results/RankedResults";
import { MakeRevisionButton } from "@/features/results/MakeRevisionButton";
import { SharePanel } from "@/features/results/SharePanel";
import { partitionRanked } from "@/lib/results-buckets";
import type { UsageAnswer } from "@/lib/derive-usage";

interface ResultDetailPageProps {
  params: Promise<{ id: string; resultNumber: string }>;
}

export default async function ResultDetailPage({ params }: ResultDetailPageProps) {
  const { id, resultNumber: resultNumberParam } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);

  const resultNumber = Number(resultNumberParam);
  const result =
    resultNumber > 0 && Number.isInteger(resultNumber)
      ? await ResultController.fromDb(db).getByCollectionAndNumber(collection.id, resultNumber)
      : null;

  if (!result || result.collectionId !== collection.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/results`);
  }

  // Drafts are adjusted on the live Ranking now (spec §4.3); a saved one is a keepsake.
  if (result.status === "draft") {
    redirect(`/collections/${collection.slug ?? collection.id}/results`);
  }

  const [resultItems, items, shares] = await Promise.all([
    ResultItemController.fromDb(db).listResultItems(result.id),
    ItemController.fromDb(db).listItems(collection.id),
    ShareController.fromDb(db).listShares(result.id),
  ]);

  const itemById = new Map(items.map((item) => [item.id, item]));
  const sortedResultItems = [...resultItems].sort((a, b) => (a.manualRank ?? a.computedRank) - (b.manualRank ?? b.computedRank));

  // Epic S: the SNAPSHOT usage (frozen at materialization) drives the same quiet
  // chip the live Standing renders. A legacy result whose rows are all NULL
  // yields an empty map → no chip anywhere (backward compat).
  const usageByItemId = new Map<string, UsageAnswer>(
    resultItems
      .filter((ri) => ri.usage != null)
      .map((ri) => [ri.itemId, ri.usage as UsageAnswer]),
  );

  // Affirmation, not subtraction (TONE #1): the loved tiers lead and the lowest
  // tier is partitioned into its own forward-framed Onward section — never tallied,
  // never the headline. effectiveBucket(ri) is the single source of truth for which.
  const { loved: lovedRows, onward: onwardRows } = partitionRanked(sortedResultItems);
  const join = <T extends { itemId: string }>(rows: T[]) =>
    rows
      .map((ri) => ({ ri, item: itemById.get(ri.itemId) }))
      .filter((r): r is { ri: typeof r.ri; item: NonNullable<typeof r.item> } => Boolean(r.item));
  const loved = join(lovedRows);
  const onward = join(onwardRows);
  const covers = await PhotoController.fromDb(db).findCoverPhotosByItemIds(
    [...loved, ...onward].map((r) => r.item.id),
  );
  const coverUrl = (itemId: string) => {
    const c = covers.get(itemId);
    return c ? getPhotoAssetUrlForPhoto(c, collection.id, { w: PHOTO_WIDTH.card }) : undefined;
  };

  const collectionSegment = collection.slug ?? collection.id;
  const isCurator = result.curatorId === session.user.id;

  return (
    <AppLayout breadcrumbs={trail.result(collection, result)}>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl text-ink sm:text-3xl">{result.name}</h1>
            <div className="mt-3">
              {/* Person-side status, not the machine word (TONE #1). Drafts
                  redirected above, so only a saved keepsake reaches here. */}
              <Badge variant="finalized">Saved</Badge>
            </div>
          </div>
        </div>

        {loved.length === 0 && onward.length === 0 ? (
          <EmptyState heading="No ranked items yet" message="A little more sorting and your ranking will appear here." />
        ) : (
          <div className="space-y-6">
            {isCurator && (
              <MakeRevisionButton resultId={result.id} rankingHref={`/collections/${collectionSegment}/results`} />
            )}
            <RankedResults
              loved={loved}
              onward={onward}
              collectionId={collectionSegment}
              coverUrl={coverUrl}
              usageByItemId={usageByItemId}
            />
          </div>
        )}

        {isCurator && (
          <SharePanel
            resultId={result.id}
            initialShares={shares}
          />
        )}
      </div>
    </AppLayout>
  );
}
