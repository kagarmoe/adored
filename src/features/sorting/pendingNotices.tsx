"use client";

import { useState, useSyncExternalStore } from "react";
import { getNoticeSet, subscribeNoticeSet, type FlushNotice } from "./decisionFlusher";

// Person-side copy for flush notices (spec §3.2/F9). Exported constants so
// tests assert the exact strings; TONE.md register — never "error"/"failed"/
// "invalid". Final wording is a TONE-review item (spec draft copy).
export const REJECTED_NOTICE =
  "One piece isn't in this collection anymore, so that answer wasn't needed";
export const QUARANTINE_NOTICE =
  "A few answers from before didn't reach us — those pieces will simply come around again";
export const SESSION_CONFLICT_NOTICE =
  "This sort was wrapped up somewhere else — reload to carry on from there";
export const AUTH_REQUIRED_NOTICE = "Sign in again and your answers will finish saving on their own";

const NOTICE_COPY = {
  rejected_unknown_item: REJECTED_NOTICE,
  quarantined: QUARANTINE_NOTICE,
  session_conflict: SESSION_CONFLICT_NOTICE,
  auth_required: AUTH_REQUIRED_NOTICE,
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
  // The engine's sticky set: read at render (no mount-effect gap), and a clear
  // (a 2xx, dismissNotice) removes the line from a mounted surface.
  const notices = useSyncExternalStore(subscribeNoticeSet, getNoticeSet, getNoticeSet);
  const [dismissed, setDismissed] = useState<ReadonlySet<NoticeKind>>(new Set());

  const visible = notices
    .map((notice) => notice.kind)
    .filter(isNoticed)
    .filter((kind) => !dismissed.has(kind));
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
