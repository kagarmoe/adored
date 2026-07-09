import type { Item } from "@/types";
import type { UsageAnswer } from "@/lib/derive-usage";
import { ItemCard } from "@/features/items/ItemCard";
import { MostLovedHero } from "@/features/results/MostLovedHero";
import { TierBadge } from "@/components/ui/TierBadge";
import { effectiveBucket, type Bucket } from "@/lib/results-buckets";

/** The minimal per-row shape both the live Standing and a finalized snapshot
 *  share: a stable key, the item id, and the two bucket fields effectiveBucket
 *  reads. Live preferences carry no manual overlay, so manualBucket is null. */
export interface RankedRow {
  id: string;
  itemId: string;
  computedBucket: Bucket;
  manualBucket: Bucket | null;
}

export interface RankedJoinedRow {
  ri: RankedRow;
  item: Item;
}

/** Love/Like/Maybe live above the Onward fold; the badge names the tier. */
const BUCKET_TO_TIER: Record<Exclude<Bucket, "low">, "love" | "like" | "maybe"> = {
  top: "love",
  high: "like",
  medium: "maybe",
};

interface RankedResultsProps {
  /** The loved tail (top/high/medium), most-loved first. loved[0] is the hero. */
  loved: RankedJoinedRow[];
  /** The Onward tail (low), asked forward — never tallied. */
  onward: RankedJoinedRow[];
  collectionId: string;
  coverUrl: (itemId: string) => string | undefined;
  /** Epic S1: the live usage fold, keyed by itemId. A row whose item is in the
   *  map gets a quiet usage chip; an absent item gets none (undecided). The raw
   *  event log is NEVER passed here — only this small derived map (DATA-6). */
  usageByItemId?: ReadonlyMap<string, UsageAnswer>;
}

/** The affirmation composition shared by the live Standing surface and the
 *  finalized snapshot viewer: most-loved hero → the full ranking → the
 *  forward-framed Onward section → an affirmation close. Callers derive
 *  loved/onward from the SAME partitionRanked/effectiveBucket source, so both
 *  surfaces read identically (TONE #1 affirmation-first, no counts). */
export function RankedResults({ loved, onward, collectionId, coverUrl, usageByItemId }: RankedResultsProps) {
  return (
    <div className="space-y-8">
      {loved.length > 0 && (
        <MostLovedHero
          item={loved[0].item}
          collectionId={collectionId}
          heroPhotoUrl={coverUrl(loved[0].item.id)}
        />
      )}
      {loved.length > 1 && (
        <section className="space-y-4">
          <h2 className="font-display text-2xl text-ink">The full ranking</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {loved.slice(1).map(({ ri, item }) => {
              const bucket = effectiveBucket(ri);
              return (
                <div key={ri.id} className="space-y-2">
                  {bucket !== "low" && (
                    <TierBadge tier={BUCKET_TO_TIER[bucket]} showLabel={false} />
                  )}
                  <ItemCard
                    item={item}
                    collectionId={collectionId}
                    heroPhotoUrl={coverUrl(item.id)}
                    bucket={bucket}
                    usage={usageByItemId?.get(item.id)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* All-Onward: no loved set, no hero. Lead from the person's side —
         honor the deciding and the clarity reached, never absence-of-love,
         never a count (TONE #1 affirmation-not-subtraction, #4 unpressured). */}
      {loved.length === 0 && onward.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-3xl text-ink">You&rsquo;ve made your choices.</h2>
          <p className="text-lg text-ink">You sat with each one and let yourself feel clearly. That clarity is the gift here — and it&rsquo;s yours.</p>
        </section>
      )}

      {/* Onward: the lowest tier, asked forward — where these go next — never
         tallied, never framed as discarding (TONE #1, #2). */}
      {onward.length > 0 && (
        <section className="space-y-4">
          <div className="space-y-1">
            {/* Onward is subordinate to the loved ranking (TONE #1): a quieter
               heading (text-xl vs the loved tail's text-2xl, ink-soft), with the
               "Onward" eyebrow folded INTO the heading so heading-nav users hear
               "Onward where these go next" as one accessible name. */}
            <h2 className="font-display text-xl text-ink-soft">
              <span className="block text-sm font-semibold uppercase tracking-wide">Onward</span>
              <span>Where these go next</span>
            </h2>
            <p className="text-ink-soft">These are ready to move on &mdash; to a new home, or simply on from here.</p>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {onward.map(({ ri, item }) => (
              <ItemCard
                key={ri.id}
                item={item}
                collectionId={collectionId}
                heroPhotoUrl={coverUrl(item.id)}
                bucket={effectiveBucket(ri)}
                usage={usageByItemId?.get(item.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* The last beat is affirmation, never the letting-go list (TONE #1).
         When something was loved, re-anchor to the loved set at the TOP (the
         hero/ranking), so the close never binds by proximity to the Onward pile
         above it. When nothing was loved, the close cannot claim "love most"
         (it would name the very items just sent Onward) — so all-Onward ends on
         the person-side act of looking honestly. Either way the page ends on
         affirmation, and this is always the composition's last content beat. */}
      <p className="font-display text-xl text-ink">
        {loved.length > 0
          ? "What you love most is at the top."
          : "You looked, honestly, at every one. That took something."}
      </p>
    </div>
  );
}
