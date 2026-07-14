"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Button } from "@/components/ui";
import { TierBadge } from "@/components/ui/TierBadge";
import {
  buildStanding,
  type CompareOutcome,
  type SampleItem,
  type Tier,
  type TriageOutcome,
} from "./sampleData";

interface WelcomeStandingProps {
  compare: CompareOutcome;
  triage: Record<string, TriageOutcome>;
  onNext: () => void;
}

const HEADING_ID = "welcome-standing-heading";

// Beat 5 — the payoff, mirroring the real results page (RankedResults): the
// beat is titled "Where things stand", the most-loved item leads under the
// "What you love most" eyebrow, then the ranking, then the onward / set-aside /
// deferred groups in subordinate styling, closing on the affirmation. The
// ranking is built from the user's own taps (buildStanding), so the top feels
// earned — the anti-marketplace weight: from things you own.
export function WelcomeStanding({ compare, triage, onNext }: WelcomeStandingProps) {
  const standing = buildStanding(compare, triage);
  const loved = standing.ranked.filter((row) => row.tier !== "onward");
  const onward = standing.ranked.filter((row) => row.tier === "onward");
  const [hero, ...lovedRest] = loved;

  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col items-center text-center gap-6">
      <h1 id={HEADING_ID} className="font-display text-3xl sm:text-4xl text-ink">
        Where things stand
      </h1>
      <p className="max-w-md text-ink-soft">
        Triage makes the groups. Usage adds a quiet note. Compare sets the order.
      </p>

      {/* Most-loved hero: the winner leads under the "What you love most" eyebrow
         (the anti-marketplace reframe — from things you own). */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          What you love most
        </p>
        <div className="relative w-48 h-48 rounded-card overflow-hidden bg-content-soft shadow-card">
          <Image src={hero.item.imageSrc} alt={hero.item.name} fill className="object-cover" unoptimized />
        </div>
        <p className="font-display text-xl text-ink">{hero.item.name}</p>
        <TierBadge tier={hero.tier} />
      </div>

      {lovedRest.length > 0 && (
        <ol className="flex flex-col gap-2 w-full max-w-sm">
          {lovedRest.map((row) => (
            <StandingRowItem key={row.item.id} item={row.item} tier={row.tier} />
          ))}
        </ol>
      )}

      {onward.length > 0 && (
        <StandingGroup
          label="Where these go next"
          caption="These are ready to move on — to a new home, or simply on from here."
        >
          {onward.map((row) => (
            <StandingRowItem key={row.item.id} item={row.item} tier={row.tier} />
          ))}
        </StandingGroup>
      )}

      {standing.setAside.length > 0 && (
        <StandingGroup label="Set aside — waiting, whenever you want them">
          {standing.setAside.map((item) => (
            <StandingRowItem key={item.id} item={item} />
          ))}
        </StandingGroup>
      )}

      {/* ponytail: deliberate demo compression — a "Not yet" item shows here as a
         gentle deferred group because a one-pass 3-item walkthrough has no later
         round; in the real app a deferred item resurfaces in the triage queue,
         not on the results page. */}
      {standing.deferred.length > 0 && (
        <StandingGroup label="Ready when you are">
          {standing.deferred.map((item) => (
            <StandingRowItem key={item.id} item={item} />
          ))}
        </StandingGroup>
      )}

      {/* Affirmation is always the last content beat (mirrors RankedResults):
         re-anchor to the loved top, never the letting-go groups above it. */}
      <p className="font-display text-xl text-ink">What you love most is at the top.</p>

      <Button size="lg" onClick={onNext}>
        Continue
      </Button>
    </section>
  );
}

// A quiet, subordinate group (onward / set-aside / deferred): a text-xl
// ink-soft eyebrow heading over its rows, mirroring RankedResults' Onward
// section, so these read as secondary to the loved ranking above.
function StandingGroup({
  label,
  caption,
  children,
}: {
  label: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col items-center gap-2 w-full">
      <h3 className="font-display text-xl text-ink-soft">{label}</h3>
      {caption && <p className="text-sm text-ink-soft">{caption}</p>}
      <ol className="flex flex-col gap-2 w-full max-w-sm">{children}</ol>
    </section>
  );
}

// One standing row: image + name, with a tier badge only when the row carries a
// tier (loved/onward rows do; set-aside and deferred items don't).
function StandingRowItem({ item, tier }: { item: SampleItem; tier?: Tier }) {
  return (
    <li className="flex items-center gap-3 rounded-card p-2 bg-surface border border-hairline">
      <span className="relative w-12 h-12 rounded-control overflow-hidden bg-content-soft shrink-0">
        <Image src={item.imageSrc} alt={item.name} fill className="object-cover" unoptimized />
      </span>
      <span className="flex-1 text-left text-ink">{item.name}</span>
      {tier && <TierBadge tier={tier} showLabel={false} />}
    </li>
  );
}
