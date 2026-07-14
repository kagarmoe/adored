import { getDb } from "@/lib/db";
import { ShareController } from "@/server/api/shares";
import { ResultController } from "@/server/api/results";
import { ResultItemController } from "@/server/api/result-items";
import { ItemController } from "@/server/api/items";
import { Badge, Card, EmptyState } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { notFound } from "next/navigation";

interface SharedResultPageProps {
  params: Promise<{ token: string }>;
}

export default async function SharedResultPage({ params }: SharedResultPageProps) {
  const { token } = await params;
  const db = getDb();
  const share = await ShareController.fromDb(db).findByToken(token);

  if (!share || share.status !== "active" || (share.expiresAt && share.expiresAt < new Date())) {
    notFound();
  }

  const result = await ResultController.fromDb(db).getResultOrNull(share.sortResultId);
  if (!result || result.status !== "finalized") {
    notFound();
  }

  const [resultItems, items] = await Promise.all([
    ResultItemController.fromDb(db).listResultItems(result.id),
    ItemController.fromDb(db).listItems(result.collectionId),
  ]);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const sortedResultItems = [...resultItems].sort((a, b) => (a.manualRank ?? a.computedRank) - (b.manualRank ?? b.computedRank));

  return (
    <main className="min-h-screen bg-ground px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <div className="mb-3">
            <Badge variant="finalized">finalized</Badge>
          </div>
          <h1 className="text-2xl text-ink sm:text-3xl">{result.name}</h1>
          <p className="mt-2 text-ink-soft">Shared read-only result</p>
        </div>

        <Card padding="lg">
          {sortedResultItems.length === 0 ? (
            <EmptyState heading="No ranked items" message="This shared result does not contain ranked items yet" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
