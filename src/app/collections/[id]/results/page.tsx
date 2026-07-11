import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireCollectionAccess } from "@/lib/collection-access";
import { ItemController } from "@/server/api/items";
import { DispositionController } from "@/server/api/dispositions";
import { DecisionController } from "@/server/api/decisions";
import { PhotoController } from "@/server/api/photos";
import { PreferenceController } from "@/server/api/preferences";
import { getPhotoAssetUrlForPhoto, PHOTO_WIDTH } from "@/lib/photos";
import { AppLayout } from "@/components/layout";
import { Button, Card, CardImage } from "@/components/ui";
import { RankedResults } from "@/features/results/RankedResults";
import { FinalizeEntry } from "@/features/results/FinalizeEntry";
import { PendingDecisionsGate } from "@/features/sorting/PendingDecisionsGate";
import { ItemCard } from "@/features/items/ItemCard";
import { deriveStanding } from "@/features/results/standing";
import { STANDING_CURRENT_FRAMING } from "@/features/results/rerank-copy";
import { deriveUsage } from "@/lib/derive-usage";
import { itemDisplayName } from "@/lib/items";
import Link from "next/link";

interface ResultsPageProps {
  params: { id: string };
}

/**
 * The Decide "Standing": a live, always-current view of where the curator's
 * collection stands right now — read straight from live preferences (NOT a
 * snapshot; no draft row is created, no engine is re-run). Finalize (Task 5b)
 * is what freezes a snapshot; until then this reflects the latest sorting.
 */
export default async function ResultsPage({ params }: ResultsPageProps) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  const db = getDb();
  const collection = await requireCollectionAccess(db, params.id, session.user.id);
  const collectionHref = `/collections/${collection.slug ?? collection.id}`;

  // Live read: this curator's own preferences (curator-scoped) + dispositions +
  // items. deriveStanding runs the SAME rankPreferencesToItems/partitionRanked
  // derivation a finalized snapshot uses — orderRank is pre-materialized, so
  // there is no engine call here.
  const [preferences, dispositions, items, curatorEvents] = await Promise.all([
    PreferenceController.fromDb(db).listItemPreferences(collection.id, session.user.id),
    DispositionController.fromDb(db).listDispositions(collection.id, session.user.id),
    ItemController.fromDb(db).listItems(collection.id),
    // The curator's whole cross-session decision log — consumed SERVER-SIDE ONLY
    // to build the usage fold below; the raw events are never threaded to a
    // client component (DATA-6). Mirrors usage/page.tsx.
    DecisionController.fromDb(db).listForCurator(collection.id, session.user.id),
  ]);

  const itemById = new Map(items.map((item) => [item.id, item]));
  const { loved, onward } = deriveStanding(preferences, itemById);
  // Read-time usage fold (latest event per live item wins) → the per-item chip.
  // Only this small Map<itemId, "uses"|"not_uses"> leaves the server.
  const usageByItemId = deriveUsage(curatorEvents, new Set(items.map((i) => i.id)));

  const setAsideItems = dispositions
    .map((d) => itemById.get(d.itemId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  // The usage-only surface (F5): items with a usage answer but no love ranking
  // still deserve to be shown. Rendered only when there is no love standing.
  const usageOnlyItems = items.filter((i) => usageByItemId.has(i.id));
  const coverItemIds = [
    ...loved.map((r) => r.item.id),
    ...onward.map((r) => r.item.id),
    ...setAsideItems.map((i) => i.id),
    ...usageOnlyItems.map((i) => i.id),
  ];
  const covers =
    coverItemIds.length > 0
      ? await PhotoController.fromDb(db).findCoverPhotosByItemIds(coverItemIds)
      : new Map();
  const coverUrl = (itemId: string) => {
    const c = covers.get(itemId);
    return c ? getPhotoAssetUrlForPhoto(c, collection.id, { w: PHOTO_WIDTH.card }) : undefined;
  };
  const hasStanding = loved.length > 0 || onward.length > 0;

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Collections", href: "/collections" },
        { label: collection.name, href: collectionHref },
        { label: "Deciding" },
      ]}
    >
      {/* Recovery gate (spec §3.4): the Standing derives from live preferences —
          pending decisions must land before it can be trusted. */}
      <PendingDecisionsGate curatorId={session.user.id}>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-3xl text-ink">Where things stand</h1>
            {/* Person-side, forward-framed, no count (TONE #1, #4). */}
            <p className="mt-2 text-ink-soft">The clearer this feels, the more it&rsquo;s yours.</p>
            {/* Epic S §4.4 bridge: name live Standing as the always-current picture,
                so a hand-order (which lives on a saved draft result, not here) never
                reads as "my order reverted". */}
            <p className="mt-1 text-sm text-ink-soft">{STANDING_CURRENT_FRAMING}</p>
          </div>
          {/* Calm, side-by-side entry points — neither competes. Put-in-order
              leads to the compare round; Finalize keeps it steady for now. */}
          {hasStanding && (
            <div className="flex flex-wrap items-start gap-3">
              <Link href={`${collectionHref}/sort`}>
                <Button variant="secondary">Put things in order</Button>
              </Link>
              <FinalizeEntry
                collectionId={collection.id}
                collectionSlug={collection.slug ?? collection.id}
              />
            </div>
          )}
        </div>

        {/* aria-live so the live Standing announces gently as it settles. */}
        <div aria-live="polite">
          {hasStanding ? (
            <RankedResults
              loved={loved}
              onward={onward}
              collectionId={collection.slug ?? collection.id}
              coverUrl={coverUrl}
              usageByItemId={usageByItemId}
            />
          ) : usageOnlyItems.length > 0 ? (
            // F5: usage answers but no love ranking yet. Show the items with their
            // quiet usage chips rather than the "Start sorting" empty state — a
            // usage-known collection is not empty.
            <section className="space-y-4">
              <div className="space-y-1">
                <h2 className="font-display text-2xl text-ink">The ones you&rsquo;ve weighed in on</h2>
                <p className="text-ink-soft">A quiet note on each &mdash; in your life, or resting for now.</p>
              </div>
              <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {usageOnlyItems.map((item) => (
                  <li key={item.id}>
                    <ItemCard
                      item={item}
                      collectionId={collection.slug ?? collection.id}
                      heroPhotoUrl={coverUrl(item.id)}
                      usage={usageByItemId.get(item.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            // Gentle, person-side empty state — never a shaming empty count.
            <section className="space-y-3">
              <h2 className="font-display text-2xl text-ink">Nothing to see yet — and that&rsquo;s fine.</h2>
              <p className="text-ink-soft">
                Once you&rsquo;ve sat with a few, what you love most will settle here, gently.
              </p>
              <div>
                <Link href={`${collectionHref}/sort`}>
                  <Button>Start sorting</Button>
                </Link>
              </div>
            </section>
          )}
        </div>

        {setAsideItems.length > 0 && (
          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="font-display text-xl text-ink-soft">
                <span className="block text-sm font-semibold uppercase tracking-wide">Set aside</span>
                <span>Waiting, whenever you want them</span>
              </h2>
              <p className="text-ink-soft">
                The ones that weren&rsquo;t yours to decide. Bring any back whenever you like.
              </p>
            </div>
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {setAsideItems.map((item) => (
                <li key={item.id}>
                  <Card padding="none" className="overflow-hidden">
                    <div className="relative aspect-square bg-content-soft">
                      <CardImage
                        src={coverUrl(item.id)}
                        alt=""
                        fallback={
                          <div aria-hidden className="flex h-full w-full items-center justify-center text-2xl text-ink-soft">
                            ☾
                          </div>
                        }
                      />
                    </div>
                    <p className="truncate p-3 text-sm text-ink">{itemDisplayName(item)}</p>
                  </Card>
                </li>
              ))}
            </ul>
            <Link href={`${collectionHref}/sort/set-aside`} className="inline-block text-sm text-ink-soft underline">
              Bring any back
            </Link>
          </section>
        )}
      </div>
      </PendingDecisionsGate>
    </AppLayout>
  );
}
