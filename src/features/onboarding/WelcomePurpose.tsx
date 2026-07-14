"use client";

import { Button } from "@/components/ui";

interface WelcomePurposeProps {
  onNext: () => void;
}

// Beat 1 — names the purpose, then orients the sample sorting walkthrough before
// any mechanic is taught.
export function WelcomePurpose({ onNext }: WelcomePurposeProps) {
  return (
    <section className="flex flex-col items-center text-center gap-6">
      <h1 className="font-display text-4xl sm:text-5xl text-ink">
        Rediscover what you love.
      </h1>
      <p className="text-lg text-ink-soft max-w-md">
        In this tutorial, you&rsquo;ll sort a small sample collection through three
        short rounds.
      </p>
      <div className="flex flex-col gap-1 max-w-md">
        <p className="text-ink-soft">Triage groups by how you feel.</p>
        <p className="text-ink-soft">Usage asks what happens in your life.</p>
        <p className="text-ink-soft">Compare puts pieces in order.</p>
        <p className="pt-3 text-ink-soft">After each round, you&rsquo;ll see what changed and what you adore.</p>
      </div>
      <Button size="lg" onClick={onNext}>
        Show me how
      </Button>
    </section>
  );
}
