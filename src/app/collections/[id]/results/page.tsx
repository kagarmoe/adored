import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Item } from "@/types";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { DispositionController } from "@/server/api/dispositions";
import { DecisionController } from "@/server/api/decisions";
import { PhotoController } from "@/server/api/photos";
import { PreferenceController } from "@/server/api/preferences";
import { RankingController } from "@/server/api/ranking";
import { buildRanking } from "@/server/services/sortResultMaterialization";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { deriveUsage, type UsageAnswer } from "@/lib/derive-usage";
import { itemDisplayName, itemInitial } from "@/lib/items";
import { quietLink } from "@/lib/design/quiet-link";
import { AppLayout } from "@/components/layout";
import { trail } from "@/components/layout/breadcrumb-trails";
import { CardImage, buttonVariants } from "@/components/ui";
import { WorkspaceModeChips } from "@/features/collections/WorkspaceModeChips";
import { PendingDecisionsGate } from "@/features/sorting/PendingDecisionsGate";
import { BringBackControl } from "@/features/sorting/BringBackControl";
import { ItemCard } from "@/features/items/ItemCard";
import { MostLovedHero } from "@/features/results/MostLovedHero";
import { RankingList, type RankingRow } from "@/features/results/RankingList";
import { SaveAndShare } from "@/features/results/SaveAndShare";

interface RankingPageProps {
  params: Promise<{ id: string }>;
}

const TIER = { top: "Love", high: "Like", medium: "Maybe" } as const;

/**
 * The live Ranking (spec §4.3). Reads only — viewing creates nothing (regression:
 * ranking-view-creates-nothing.integration.test.ts). Hand moves pin into the one
 * open draft through the pins API; Save and share freezes it.
 */
export default async function RankingPage({ params }: RankingPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }
  const db = getDb();
  const collection = await requireCollectionAccess(db, id, session.user.id);
  const curatorId = session.user.id;
  const slug = collection.slug ?? collection.id;
  const base = `/collections/${slug}`;

  const [preferences, dispositions, items, curatorEvents, pins] = await Promise.all([
    PreferenceController.fromDb(db).listItemPreferences(collection.id, curatorId),
    DispositionController.fromDb(db).listDispositions(collection.id, curatorId),
    ItemController.fromDb(db).listItems(collection.id),
    // Server-side only: folded into a small usage map, never sent to the client (DATA-6).
    DecisionController.fromDb(db).listForCurator(collection.id, curatorId),
    RankingController.fromDb(db).listPins(collection.id, curatorId),
  ]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const liveIds = new Set(itemById.keys());
  const { loved, onward } = buildRanking(preferences, liveIds, pins);
  const usageByItemId = deriveUsage(curatorEvents, liveIds);
  const lookup = (ids: string[]) => ids.flatMap((itemId) => {
    const item = itemById.get(itemId);
    return item ? [item] : [];
  });
  const stillDeciding = lookup(dispositions.filter((d) => d.disposition === "deferred").map((d) => d.itemId));
  const setAside = lookup(dispositions.filter((d) => d.disposition === "set_aside").map((d) => d.itemId));
  const onwardItems = lookup(onward.map((e) => e.itemId));

  const shownIds = [...loved.map((e) => e.itemId), ...onwardItems.map((i) => i.id), ...stillDeciding.map((i) => i.id), ...setAside.map((i) => i.id)];
  const covers = shownIds.length > 0 ? await PhotoController.fromDb(db).findCoverPhotosByItemIds(shownIds) : new Map();
  const coverUrl = (itemId: string) => {
    const cover = covers.get(itemId);
    return cover ? getPhotoAssetUrlForPhoto(cover, collection.id, { w: PHOTO_WIDTH.card }) : undefined;
  };
  const hrefOf = (item: Item) => (item.number === null ? `${base}/items` : `${base}/items/${item.number}`);

  const rows: RankingRow[] = loved.flatMap((entry) => {
    const item = itemById.get(entry.itemId);
    if (!item || entry.bucket === "low") return [];
    return [{
      itemId: item.id,
      href: hrefOf(item),
      name: itemDisplayName(item),
      coverUrl: coverUrl(item.id),
      initial: itemInitial(item),
      tier: TIER[entry.bucket],
      pinned: entry.pinned,
      usage: usageByItemId.get(item.id),
    }];
  });
  const hero = rows.length > 0 ? itemById.get(rows[0].itemId) : undefined;
  const hasRanking = rows.length > 0 || onwardItems.length > 0;
  const defaultName = `${collection.name}, ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

  return (
    <AppLayout breadcrumbs={trail.results(collection)}>
      {/* Queued answers land before the ranking is read. */}
      <PendingDecisionsGate curatorId={curatorId}>
        <div className="space-y-8">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="font-display text-2xl text-ink sm:text-3xl">Your ranking</h1>
              <p className="mt-2 text-ink-soft">Move any piece by hand and it stays where you put it.</p>
            </div>
            {hasRanking && (
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <SaveAndShare collectionId={collection.id} collectionSlug={slug} defaultName={defaultName} />
                <Link href={`${base}/sort`} className={quietLink}>
                  Keep sorting
                </Link>
              </div>
            )}
          </header>

          <WorkspaceModeChips base={base} activeMode="decide" />

          {hasRanking ? (
            <>
              {hero && <MostLovedHero item={hero} collectionId={slug} heroPhotoUrl={coverUrl(hero.id)} />}
              {rows.length > 0 && <RankingList collectionId={collection.id} rows={rows} />}
              {onwardItems.length > 0 && (
                <ItemRow id="ranking-onward" heading="Onward" caption="Where these go next." items={onwardItems} slug={slug} coverUrl={coverUrl} usageOf={(itemId) => usageByItemId.get(itemId)} />
              )}
            </>
          ) : (
            <section className="space-y-3">
              <h2 className="font-display text-2xl text-ink">Nothing to see yet — and that&rsquo;s fine.</h2>
              <p className="text-ink-soft">Once you&rsquo;ve sat with a few, what you love most will settle here.</p>
              <Link href={`${base}/sort`} className={buttonVariants()}>
                Start sorting
              </Link>
            </section>
          )}

          {stillDeciding.length > 0 && (
            <ItemRow id="ranking-still-deciding" heading="Still deciding" caption="Ready when you are." items={stillDeciding} slug={slug} coverUrl={coverUrl} usageOf={(itemId) => usageByItemId.get(itemId)} />
          )}

          {setAside.length > 0 && (
            <details className="rounded-card border border-hairline bg-surface p-4">
              <summary className="flex min-h-11 cursor-pointer items-center text-ink">Set aside</summary>
              <ul className="mt-3 space-y-3">
                {setAside.map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control bg-content-soft">
                      <CardImage src={coverUrl(item.id)} alt="" fallback={<span aria-hidden className="text-ink-soft">☾</span>} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink">{itemDisplayName(item)}</span>
                    <BringBackControl collectionId={collection.id} itemId={item.id} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </PendingDecisionsGate>
    </AppLayout>
  );
}

function ItemRow({
  id,
  heading,
  caption,
  items,
  slug,
  coverUrl,
  usageOf,
}: {
  id: string;
  heading: string;
  caption: string;
  items: Item[];
  slug: string;
  coverUrl: (itemId: string) => string | undefined;
  usageOf: (itemId: string) => UsageAnswer | undefined;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <h2 id={id} className="font-display text-xl text-ink">
          {heading}
        </h2>
        <p className="text-sm text-ink-soft">{caption}</p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id}>
            <ItemCard item={item} collectionId={slug} heroPhotoUrl={coverUrl(item.id)} usage={usageOf(item.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
