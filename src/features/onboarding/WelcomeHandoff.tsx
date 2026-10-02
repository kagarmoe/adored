"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui";

interface WelcomeHandoffProps {
  /** Quiet exit — routes to /collections without starting a collection. */
  onExplore: () => void;
}

// Beat 5 — hand off to their world. Primary CTA into the real new-collection
// flow; a quiet way to just look around.
export function WelcomeHandoff({ onExplore }: WelcomeHandoffProps) {
  return (
    <section className="flex flex-col items-center text-center gap-6">
      <h1 className="font-display text-4xl text-ink">Now, your turn.</h1>
      <div className="flex flex-col gap-1 max-w-md">
        <p className="text-lg text-ink-soft">
          Begin with photos. They can wait in the pool until you make items.
        </p>
        <p className="text-lg text-ink-soft">
          Sort whenever you like, a few pieces at a time.
        </p>
      </div>

      <Link href="/collections/new" className={buttonVariants({ size: "lg" })}>
        Start a collection
      </Link>

      <button
        type="button"
        onClick={onExplore}
        className="h-11 px-4 text-ink-soft underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary rounded-control"
      >
        I&rsquo;ll explore on my own.
      </button>
    </section>
  );
}
