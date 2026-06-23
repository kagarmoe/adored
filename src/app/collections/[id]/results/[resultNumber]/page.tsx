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
import { ItemCard } from "@/features/items/ItemCard";
import { MostLovedHero } from "@/features/results/MostLovedHero";
import { SharePanel } from "@/features/results/SharePanel";
import { partitionRanked, effectiveBucket } from "@/lib/results-buckets";
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
              <Badge variant={result.status}>{result.status}</Badge>
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
          <div className="space-y-8">
            {loved.length > 0 && (
              <MostLovedHero
                item={loved[0].item}
                collectionId={collection.slug ?? collection.id}
                heroPhotoUrl={coverUrl(loved[0].item.id)}
              />
            )}
            {loved.length > 1 && (
              <section className="space-y-4">
                <h2 className="font-display text-2xl text-ink">The full ranking</h2>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                  {loved.slice(1).map(({ ri, item }) => (
                    <ItemCard
                      key={ri.id}
                      item={item}
                      collectionId={collection.slug ?? collection.id}
                      heroPhotoUrl={coverUrl(item.id)}
                      bucket={effectiveBucket(ri)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Onward: the lowest tier, asked forward — where these go next — never
               tallied, never framed as discarding (TONE #1, #2). */}
            {onward.length > 0 && (
              <section className="space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Onward</p>
                  <h2 className="font-display text-2xl text-ink">Where these go next</h2>
                  <p className="text-ink-soft">These have given what they had to give — they can move on to someone new.</p>
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                  {onward.map(({ ri, item }) => (
                    <ItemCard
                      key={ri.id}
                      item={item}
                      collectionId={collection.slug ?? collection.id}
                      heroPhotoUrl={coverUrl(item.id)}
                      bucket={effectiveBucket(ri)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* The last beat is affirmation, never the letting-go list (TONE #1). */}
            <p className="font-display text-xl text-ink">These are the things you love most.</p>
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
