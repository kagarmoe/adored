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
import { SharePanel } from "@/features/results/SharePanel";
import { partitionRanked } from "@/lib/results-buckets";
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
          <RankedResults
            loved={loved}
            onward={onward}
            collectionId={collection.slug ?? collection.id}
            coverUrl={coverUrl}
          />
        )}

        {result.status === "finalized" && result.curatorId === session.user.id && (
          <SharePanel
            resultId={result.id}
            initialShares={shares}
          />
        )}
      </div>
    </AppLayout>
  );
}
