"use client";

import { useEffect, useRef } from "react";

// After Bring back from a card in the Archived view the card leaves this list, so focus
// lands here and says where it went (a server-rendered live region is not announced on
// a fresh navigation; the focus move is). The page renders it only for a verified id.
export function BroughtBackNotice() {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <p ref={ref} tabIndex={-1} role="status" className="rounded-card bg-glass p-4 text-sm text-ink ring-1 ring-rim focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
      Brought back. It&rsquo;s under All.
    </p>
  );
}
