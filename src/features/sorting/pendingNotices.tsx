"use client";

import { useEffect, useState } from "react";
import { subscribeNotices, type FlushNotice } from "./decisionFlusher";

// Person-side copy for flush notices (spec §3.2/F9). Exported constants so
// tests assert the exact strings; TONE.md register — never "error"/"failed"/
// "invalid". Final wording is a TONE-review item (spec draft copy).
export const REJECTED_NOTICE =
  "One piece isn't in this collection anymore, so that answer wasn't needed";
export const QUARANTINE_NOTICE =
  "A few answers from before didn't reach us — those pieces will simply come around again";
export const SESSION_CONFLICT_NOTICE =
  "This sort was wrapped up somewhere else — reload to carry on from there";

const NOTICE_COPY = {
  rejected_unknown_item: REJECTED_NOTICE,
  quarantined: QUARANTINE_NOTICE,
  session_conflict: SESSION_CONFLICT_NOTICE,
} as const;

type NoticeKind = keyof typeof NOTICE_COPY;

function isNoticed(kind: FlushNotice["kind"]): kind is NoticeKind {
  return kind in NOTICE_COPY;
}

/**
 * The quiet person-side notice slot: subscribes to the flush engine and renders
 * AT MOST one dismissible, non-blocking line per notice kind per surface mount —
 * a whole drain's worth of rejections (or N quarantined entries) collapses to a
 * single sentence. Mounted OUTSIDE the round's content swap so it survives the
 * round-end recap ("no later than the revert", F9). The engine never renders;
 * this is its only voice. `PendingDecisionsGate` reuses the same slot (Task 15).
 */
export function PendingNotices() {
  const [active, setActive] = useState<ReadonlySet<NoticeKind>>(new Set());
  const [dismissed, setDismissed] = useState<ReadonlySet<NoticeKind>>(new Set());

  useEffect(
    () =>
      subscribeNotices((notice: FlushNotice) => {
        if (!isNoticed(notice.kind)) return;
        const kind = notice.kind;
        setActive((prev) => (prev.has(kind) ? prev : new Set(prev).add(kind)));
      }),
    [],
  );

  const visible = [...active].filter((kind) => !dismissed.has(kind));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((kind) => (
        <p
          key={kind}
          role="status"
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-control bg-content-soft px-4 py-3 text-sm text-ink-soft"
        >
          <span>{NOTICE_COPY[kind]}</span>
          <button
            type="button"
            onClick={() =>
              setDismissed((prev) => new Set(prev).add(kind))
            }
            className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary rounded-xs"
          >
            Okay
          </button>
        </p>
      ))}
    </div>
  );
}
