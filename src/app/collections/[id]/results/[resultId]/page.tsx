import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { AppLayout } from "@/components/layout";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { SharePanel } from "@/features/results/SharePanel";
import Link from "next/link";

interface ResultDetailPageProps {
  params: { id: string; resultId: string };
}

const bucketLabels = {
  top: "Love",
  high: "Like",
  medium: "Maybe",
  low: "Release",
};

export default async function ResultDetailPage({ params }: ResultDetailPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collectionRepo = new CollectionRepository(db);
  const resultRepo = new SortResultRepository(db);
  const resultItemRepo = new SortResultItemRepository(db);
  const itemRepo = new ItemRepository(db);
  const shareRepo = new SortResultShareRepository(db);
  const [collection, result, resultItems, items, shares] = await Promise.all([
    collectionRepo.findById(params.id),
    resultRepo.findById(params.resultId),
    resultItemRepo.findByResult(params.resultId),
    itemRepo.findByCollection(params.id),
    shareRepo.findByResult(params.resultId),
  ]);

  if (!collection || !result || result.collectionId !== params.id) {
    redirect(`/collections/${params.id}/results`);
  }

  const itemById = new Map(items.map((item) => [item.id, item]));
  const sortedResultItems = [...resultItems].sort((a, b) => (a.manualRank ?? a.computedRank) - (b.manualRank ?? b.computedRank));
  const bucketCounts = sortedResultItems.reduce<Record<string, number>>((counts, item) => {
    const bucket = item.manualBucket || item.computedBucket;
    counts[bucket] = (counts[bucket] || 0) + 1;
    return counts;
  }, {});

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: `/collections/${params.id}` },
        { label: "Results", href: `/collections/${params.id}/results` },
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
            <Link href={`/collections/${params.id}/results/${params.resultId}/finalize`}>
              <Button>Finalize</Button>
            </Link>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          {(["top", "high", "medium", "low"] as const).map((bucket) => (
            <Card key={bucket} padding="md">
              <p className="text-sm font-medium text-ink-soft">{bucketLabels[bucket]}</p>
              <p className="mt-2 text-2xl font-bold text-ink">{bucketCounts[bucket] || 0}</p>
            </Card>
          ))}
        </div>

        {sortedResultItems.length === 0 ? (
          <EmptyState heading="No ranked items yet" message="Complete more sorting decisions to populate this result" />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {sortedResultItems.map((resultItem, index) => {
              const item = itemById.get(resultItem.itemId);
              if (!item) return null;
              return (
                <ItemCard
                  key={resultItem.id}
                  item={item}
                  collectionId={params.id}
                  bucket={resultItem.manualBucket || resultItem.computedBucket}
                  isTop={index === 0 && sortedResultItems.length > 1}
                />
              );
            })}
          </div>
        )}

        {result.status === "finalized" && (
          <SharePanel
            resultId={params.resultId}
            initialShares={shares}
          />
        )}
      </div>
    </AppLayout>
  );
}
