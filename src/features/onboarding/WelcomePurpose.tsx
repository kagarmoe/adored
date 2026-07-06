"use client";

import { Button } from "@/components/ui";

interface WelcomePurposeProps {
  onNext: () => void;
}

// Beat 1 — the anti-marketplace screen. Names the purpose, then contrasts it
// with a store, before any mechanic is taught.
export function WelcomePurpose({ onNext }: WelcomePurposeProps) {
  return (
    <section className="flex flex-col items-center text-center gap-6">
      <h1 className="font-display text-4xl sm:text-5xl text-ink">
        Rediscover what you love.
      </h1>
      <p className="text-lg text-ink-soft max-w-md">
        Adored isn&rsquo;t a store. It&rsquo;s a way to notice which of your
        things you love most, one gentle choice at a time.
      </p>
      <div className="flex flex-col gap-1 max-w-md">
        <p className="text-ink-soft">Gather a few photos of your things.</p>
        <p className="text-ink-soft">Sort in short rounds.</p>
        <p className="text-ink-soft">See where things stand.</p>
      </div>
      <Button size="lg" onClick={onNext}>
        Show me how
      </Button>
    </section>
  );
}
