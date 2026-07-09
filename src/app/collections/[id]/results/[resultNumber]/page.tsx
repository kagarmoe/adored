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
import { Badge, Button, EmptyState } from "@/components/ui";
import { RankedResults } from "@/features/results/RankedResults";
import { RerankPanel, type RerankRow } from "@/features/results/RerankPanel";
import { SharePanel } from "@/features/results/SharePanel";
import { partitionRanked } from "@/lib/results-buckets";
import { itemDisplayName } from "@/lib/items";
import type { UsageAnswer } from "@/lib/derive-usage";
import Link from "next/link";

interface ResultDetailPageProps {
  params: { id: string; resultNumber: string };
}

export default async function ResultDetailPage({ params }: ResultDetailPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);

  const resultNumber = Number(params.resultNumber);
  const result =
    resultNumber > 0 && Number.isInteger(resultNumber)
      ? await ResultController.fromDb(db).getByCollectionAndNumber(collection.id, resultNumber)
      : null;

  if (!result || result.collectionId !== collection.id) {
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

  // Epic S S3b: the flat hand-order list is scoped to the LOVED tier — what
  // manualRank meaningfully orders. Onward (resting) rows are excluded so a
  // within-tier reorder visibly sticks (dragging an Onward row wouldn't change
  // its bucket, which read as "my arrangement didn't hold"); cross-tier hand-order
  // is a follow-up (purses-9v1f.1). Onward items still render read-only in the
  // composed keepsake view. Item name + cover are resolved server-side (the client
  // never touches the item store or photo store); computedRank rides along so
  // "Back to the suggested order" can revert optimistically.
  const collectionSegment = collection.slug ?? collection.id;
  const isCurator = result.curatorId === session.user.id;
  const rerankRows: RerankRow[] = loved.map(({ ri, item }) => ({
    rid: ri.id,
    itemId: item.id,
    name: itemDisplayName(item),
    coverUrl: coverUrl(item.id),
    computedRank: ri.computedRank,
  }));

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${collection.slug ?? collection.id}` },
        { label: "Results", href: `/collections/${collection.slug ?? collection.id}/results` },
        { label: result.name },
      ]}
    >
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl text-ink">{result.name}</h1>
            <div className="mt-3">
              {/* Person-side status, not machine words (TONE #1): a finalized
                  snapshot is one you've "Saved"; a draft is one you're "Still
                  deciding". The variant keeps the semantic styling. */}
              <Badge variant={result.status}>
                {result.status === "finalized" ? "Saved" : "Still deciding"}
              </Badge>
            </div>
          </div>
          {result.status === "draft" && (
            <Link href={`/collections/${collection.slug ?? collection.id}/results/${result.number}/finalize`}>
              <Button>Finalize</Button>
            </Link>
          )}
        </div>

        {loved.length === 0 && onward.length === 0 ? (
          <EmptyState heading="No ranked items yet" message="A little more sorting and your ranking will appear here." />
        ) : (
          <RerankPanel
            resultId={result.id}
            collectionId={collectionSegment}
            status={result.status}
            rows={rerankRows}
            canRevise={isCurator}
          >
            <RankedResults
              loved={loved}
              onward={onward}
              collectionId={collectionSegment}
              coverUrl={coverUrl}
              usageByItemId={usageByItemId}
            />
          </RerankPanel>
        )}

        {result.status === "finalized" && isCurator && (
          <SharePanel
            resultId={result.id}
            initialShares={shares}
          />
        )}
      </div>
    </AppLayout>
  );
}
