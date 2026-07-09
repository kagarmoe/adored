"use client";

import { Button } from "@/components/ui";

interface WelcomeRefineProps {
  onNext: () => void;
}

// Beat 6 — teach that the standing is living, not a verdict. It keeps updating
// as they sort ("Put things in order" names the real button they'll meet), and
// only becomes a shareable artifact when they choose to finalize it.
export function WelcomeRefine({ onNext }: WelcomeRefineProps) {
  return (
    <section className="flex flex-col items-center text-center gap-6">
      <h1 className="font-display text-3xl sm:text-4xl text-ink">Refine it any time</h1>
      <div className="flex flex-col gap-3 max-w-md">
        <p className="text-lg text-ink-soft">
          The standing keeps updating as you sort &mdash; &ldquo;Put things in
          order&rdquo; starts another round whenever you want it truer.
        </p>
        <p className="text-lg text-ink-soft">
          When it feels complete, you can finalize it and share it.
        </p>
      </div>
      <Button size="lg" onClick={onNext}>
        Continue
      </Button>
    </section>
  );
}
