"use client";

import { Button } from "@/components/ui";

interface WelcomePurposeProps {
  onNext: () => void;
}

// Beat 1 — names the purpose, then orients the real collection flow before any
// mechanic is taught.
export function WelcomePurpose({ onNext }: WelcomePurposeProps) {
  return (
    <section className="flex flex-col items-center text-center gap-6">
      <h1 className="font-display text-4xl sm:text-5xl text-ink">
        Rediscover what you love.
      </h1>
      <p className="text-lg text-ink-soft max-w-md">
        Adored helps you build a collection from photos, make items when
        you&rsquo;re ready, and notice what you love most through three gentle sorts.
      </p>
      <div className="flex flex-col gap-1 max-w-md">
        <p className="text-ink-soft">Add photos to a collection.</p>
        <p className="text-ink-soft">Make items when you&rsquo;re ready.</p>
        <p className="text-ink-soft">Triage groups how you feel.</p>
        <p className="text-ink-soft">Usage notes whether each piece is in your life.</p>
        <p className="text-ink-soft">Compare puts pieces in order.</p>
        <p className="text-ink-soft">See what you love most.</p>
      </div>
      <Button size="lg" onClick={onNext}>
        Show me how
      </Button>
    </section>
  );
}
