import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { Badge, Button, EmptyState } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { MostLovedHero } from "@/features/results/MostLovedHero";
import { SharePanel } from "@/features/results/SharePanel";
import Link from "next/link";

interface ResultDetailPageProps {
  params: { id: string; resultNumber: string };
}

const bucketLabels = {
  top: "Love",
  high: "Like",
  medium: "Maybe",
  low: "Onward",
};

// The cool value-ramp made visible: deeper teal = more loved, palest = Onward.
const bucketRamp: Record<"top" | "high" | "medium" | "low", string> = {
  top: "bg-tier-love text-tier-love-ink",
  high: "bg-tier-like text-tier-like-ink",
  medium: "bg-tier-maybe text-tier-maybe-ink",
  low: "bg-tier-onward text-tier-onward-ink",
};

export default async function ResultDetailPage({ params }: ResultDetailPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const resultRepo = new SortResultRepository(db);
  const resultItemRepo = new SortResultItemRepository(db);
  const itemRepo = new ItemRepository(db);
  const shareRepo = new SortResultShareRepository(db);

  const resultNumber = Number(params.resultNumber);
  const result =
    resultNumber > 0 && Number.isInteger(resultNumber)
      ? await resultRepo.findByCollectionAndNumber(collection.id, resultNumber)
      : null;

  if (!result || result.collectionId !== collection.id) {
    redirect(`/collections/${collection.slug ?? collection.id}/results`);
  }

  const [resultItems, items, shares] = await Promise.all([
    resultItemRepo.findByResult(result.id),
    itemRepo.findByCollection(collection.id),
    shareRepo.findByResult(result.id),
  ]);

  const itemById = new Map(items.map((item) => [item.id, item]));
  const sortedResultItems = [...resultItems].sort((a, b) => (a.manualRank ?? a.computedRank) - (b.manualRank ?? b.computedRank));
  const bucketCounts = sortedResultItems.reduce<Record<string, number>>((counts, item) => {
    const bucket = item.manualBucket || item.computedBucket;
    counts[bucket] = (counts[bucket] || 0) + 1;
    return counts;
  }, {});

  const ranked = sortedResultItems
    .map((ri) => ({ ri, item: itemById.get(ri.itemId) }))
    .filter((r): r is { ri: typeof r.ri; item: NonNullable<typeof r.item> } => Boolean(r.item));
  const covers = await new PhotoRepository(db).findCoverPhotosByItemIds(ranked.map((r) => r.item.id));
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
              <Badge variant={result.status}>{result.status}</Badge>
            </div>
          </div>
          {result.status === "draft" && (
            <Link href={`/collections/${collection.slug ?? collection.id}/results/${result.number}/finalize`}>
              <Button>Finalize</Button>
            </Link>
          )}
        </div>

        {/* The value ramp as structure: deeper teal = more loved. */}
        <div className="grid gap-3 sm:grid-cols-4">
          {(["top", "high", "medium", "low"] as const).map((bucket) => (
            <div key={bucket} className={`rounded-card px-4 py-5 ${bucketRamp[bucket]}`}>
              <p className="text-sm font-semibold">{bucketLabels[bucket]}</p>
              <p className="mt-1 text-3xl font-bold">{bucketCounts[bucket] || 0}</p>
            </div>
          ))}
        </div>

        {sortedResultItems.length === 0 || ranked.length === 0 ? (
          <EmptyState heading="No ranked items yet" message="A little more sorting and your ranking will appear here." />
        ) : (
          <div className="space-y-8">
            <MostLovedHero
              item={ranked[0].item}
              collectionId={collection.slug ?? collection.id}
              heroPhotoUrl={coverUrl(ranked[0].item.id)}
            />
            {ranked.length > 1 && (
              <div className="space-y-4">
                <h2 className="text-ink">The full ranking</h2>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                  {ranked.slice(1).map(({ ri, item }) => (
                    <ItemCard
                      key={ri.id}
                      item={item}
                      collectionId={collection.slug ?? collection.id}
                      heroPhotoUrl={coverUrl(item.id)}
                      bucket={ri.manualBucket || ri.computedBucket}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
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
