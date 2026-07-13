"use client";

import Link from "next/link";
import { useState } from "react";
import {
  whatMoved,
  inYourLifeLine,
  restingLine,
  type MovedDecision,
  type WhatMovedSummary,
} from "@/lib/what-moved";

interface WhatMovedProps {
  /** The session's decisions; only those inside the window are counted. */
  decisions: MovedDecision[];
  /** Round window start (client-recorded round start). */
  windowStartMs: number;
  /** Round window end (an injectable "now"; defaults to Date.now()). */
  nowMs?: number;
  /** Where "Back to your sort" returns to (the session hub). */
  hubHref: string;
}

/** A single affirming line per outcome, only when that outcome has a count. */
function lines(summary: WhatMovedSummary): string[] {
  const out: string[] = [];
  if (summary.love > 0) out.push(`${summary.love} you love`);
  if (summary.like > 0) out.push(`${summary.like} you like`);
  if (summary.maybe > 0) out.push(`${summary.maybe} to sit with`);
  if (summary.onward > 0) out.push(`${summary.onward} moved onward`);
  if (summary.ranked > 0) {
    out.push(`${summary.ranked} ${summary.ranked === 1 ? "comparison" : "comparisons"} made`);
  }
  if (summary.uses > 0) out.push(inYourLifeLine(summary.uses));
  if (summary.resting > 0) out.push(restingLine(summary.resting));
  return out;
}

/**
 * Shown at a round's end (timer expiry OR the queue emptying). A calm, best-effort
 * recap of what the person moved in this round — server-time decisions within the
 * round window, grouped by outcome. Forward-framed ("Here's what moved"), never a
 * score or a remaining count. aria-live so it's announced when it replaces the round.
 */
export function WhatMoved({ decisions, windowStartMs, nowMs, hubHref }: WhatMovedProps) {
  // The recap is a still photograph: when the caller hands no window end, it closes at
  // the moment this mounts (a lazy initializer — Date.now() is impure, never a render read).
  const [mountedAtMs] = useState(() => Date.now());
  const summary = whatMoved(decisions, windowStartMs, nowMs ?? mountedAtMs);
  const items = lines(summary);

  return (
    <div aria-live="polite" className="mx-auto max-w-xl space-y-6 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl text-ink">Here&apos;s what moved</h2>
        {summary.total === 0 ? (
          <p className="text-ink-soft">
            You took a gentle pass this round. Everything&apos;s just where you left it.
          </p>
        ) : (
          <ul className="space-y-1 text-ink-soft">
            {items.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>

      <p>
        <Link
          href={hubHref}
          className="inline-flex h-11 items-center rounded-control px-4 text-ink underline underline-offset-2 hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
        >
          Back to your sort
        </Link>
      </p>
    </div>
  );
}
