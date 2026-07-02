"use client";

import Image from "next/image";
import { Button } from "@/components/ui";
import { TierBadge } from "@/components/ui/TierBadge";
import { buildStanding, type Tier } from "./sampleData";

interface WelcomeStandingProps {
  compareWinnerId: string;
  triageChoices: Record<string, Tier>;
  onNext: () => void;
}

// Beat 4 — the payoff + reframe. The ranking is built from the user's own taps
// (buildStanding), so the crown feels earned. "What you love most" carries the
// anti-marketplace weight: from things you own.
export function WelcomeStanding({
  compareWinnerId,
  triageChoices,
  onNext,
}: WelcomeStandingProps) {
  const standing = buildStanding(compareWinnerId, triageChoices);
  const [hero, ...rest] = standing;

  return (
    <section className="flex flex-col items-center text-center gap-6">
      <h2 className="font-display text-3xl sm:text-4xl text-ink">What you love most</h2>
      <p className="text-lg text-ink-soft max-w-md">
        Adored showed you what you love most &mdash; from things you own.
      </p>

      <div className="flex flex-col items-center gap-2">
        <div className="relative w-48 h-48 rounded-card overflow-hidden bg-content-soft shadow-card">
          <Image src={hero.item.imageSrc} alt={hero.item.name} fill className="object-cover" unoptimized />
        </div>
        <p className="font-display text-xl text-ink">{hero.item.name}</p>
        <TierBadge tier={hero.tier} />
      </div>

      <ol className="flex flex-col gap-2 w-full max-w-sm">
        {rest.map((row) => (
          <li
            key={row.item.id}
            className="flex items-center gap-3 rounded-card p-2 bg-surface border border-hairline"
          >
            <span className="relative w-12 h-12 rounded-control overflow-hidden bg-content-soft shrink-0">
              <Image src={row.item.imageSrc} alt={row.item.name} fill className="object-cover" unoptimized />
            </span>
            <span className="flex-1 text-left text-ink">{row.item.name}</span>
            <TierBadge tier={row.tier} showLabel={false} />
          </li>
        ))}
      </ol>

      <Button size="lg" onClick={onNext}>
        Continue
      </Button>
    </section>
  );
}
