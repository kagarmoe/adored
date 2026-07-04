"use client";

import Image from "next/image";
import { COMPARE_PAIR } from "./sampleData";

interface WelcomeCompareProps {
  /** Records the winner and advances to the Standing beat. */
  onChoose: (winnerId: string) => void;
}

// Beat 3 — two of YOUR things, the prompt dominant. Each side is a tap target,
// framed as "which do you love more" — never two product cards to buy.
export function WelcomeCompare({ onChoose }: WelcomeCompareProps) {
  const [left, right] = COMPARE_PAIR;

  return (
    <section className="flex flex-col items-center text-center gap-8">
      <h2 className="font-display text-3xl sm:text-4xl text-ink">
        Which do you love more?
      </h2>

      <div className="flex flex-col sm:flex-row items-stretch justify-center gap-6 w-full max-w-xl">
        {[left, right].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChoose(item.id)}
            className="flex-1 flex flex-col items-center gap-3 min-h-11 rounded-card p-4 bg-surface shadow-card border border-hairline transition-colors hover:bg-content-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
          >
            <span className="relative w-40 h-40 rounded-card overflow-hidden bg-content-soft">
              <Image src={item.imageSrc} alt={item.name} fill className="object-cover" unoptimized />
            </span>
            <span className="text-base text-ink">{item.name}</span>
          </button>
        ))}
      </div>

      <p className="text-sm text-ink-soft">
        When two feel close, this shows which you love more.
      </p>
    </section>
  );
}
