import { getDb } from "@/lib/db";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { Badge, Card, EmptyState } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { notFound } from "next/navigation";

interface SharedResultPageProps {
  params: { token: string };
}

export default async function SharedResultPage({ params }: SharedResultPageProps) {
  const db = getDb();
  const shareRepo = new SortResultShareRepository(db);
  const resultRepo = new SortResultRepository(db);
  const resultItemRepo = new SortResultItemRepository(db);
  const itemRepo = new ItemRepository(db);
  const share = await shareRepo.findByToken(params.token);

  if (!share || share.status !== "active" || (share.expiresAt && share.expiresAt < new Date())) {
    notFound();
  }

  const result = await resultRepo.findById(share.sortResultId);
  if (!result || result.status !== "finalized") {
    notFound();
  }

  const [resultItems, items] = await Promise.all([
    resultItemRepo.findByResult(result.id),
    itemRepo.findByCollection(result.collectionId),
  ]);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const sortedResultItems = [...resultItems].sort((a, b) => (a.manualRank ?? a.computedRank) - (b.manualRank ?? b.computedRank));

  return (
    <main className="min-h-screen bg-plaster px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <div className="mb-3">
            <Badge variant="finalized">finalized</Badge>
          </div>
          <h1 className="text-3xl text-ink">{result.name}</h1>
          <p className="mt-2 text-ink-soft">Shared read-only result</p>
        </div>

        <Card padding="lg">
          {sortedResultItems.length === 0 ? (
            <EmptyState heading="No ranked items" message="This shared result does not contain ranked items yet" />
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {sortedResultItems.map((resultItem) => {
                const item = itemById.get(resultItem.itemId);
                if (!item) return null;
                return (
                  <ItemCard
                    key={resultItem.id}
                    item={item}
                    collectionId={result.collectionId}
                    bucket={resultItem.manualBucket || resultItem.computedBucket}
                  />
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
