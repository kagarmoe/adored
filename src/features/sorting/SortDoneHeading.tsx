"use client";

import { useEffect, useRef } from "react";

/**
 * The end-of-sort heading takes focus when it appears: the last pair's controls
 * leave with the answer, and focus would otherwise fall to <body> unannounced.
 */
export function SortDoneHeading({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <h1 ref={ref} tabIndex={-1} className="font-display text-3xl text-ink focus:outline-hidden">
      {children}
    </h1>
  );
}
