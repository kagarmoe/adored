"use client";

import Image from "next/image";
import { TierBadge } from "@/components/ui/TierBadge";
import { TRIAGE_ITEMS, type Tier } from "./sampleData";

interface WelcomeTriageProps {
  /** Records the tap and advances to the next item, then the next beat. */
  onChoose: (itemId: string, tier: Tier) => void;
  /** Which triage item is on screen. Strictly one at a time — never a grid. */
  index: number;
}

const TIERS: readonly Tier[] = ["love", "like", "maybe", "onward"];

// Beat 2 — one thing at a time, four tiers. No grid of samples (that reads
// shop-like); a single object fills the frame.
export function WelcomeTriage({ onChoose, index }: WelcomeTriageProps) {
  const item = TRIAGE_ITEMS[index];

  return (
    <section className="flex flex-col items-center text-center gap-6">
      <h2 className="font-display text-3xl text-ink">How do you feel about this one?</h2>

      <div className="relative w-64 h-64 rounded-card overflow-hidden bg-content-soft shadow-card">
        <Image src={item.imageSrc} alt={item.name} fill className="object-cover" unoptimized />
      </div>
      <p className="text-lg text-ink">{item.name}</p>

      <div className="flex flex-wrap justify-center gap-3">
        {TIERS.map((tier) => (
          <button
            key={tier}
            type="button"
            onClick={() => onChoose(item.id, tier)}
            className="h-11 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
          >
            <TierBadge tier={tier} className="px-4 py-2" />
          </button>
        ))}
      </div>

      <p className="text-sm text-ink-soft">Tap how you feel. There are no wrong answers.</p>
    </section>
  );
}
