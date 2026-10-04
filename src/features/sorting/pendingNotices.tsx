"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { quietLink } from "@/lib/design/quiet-link";
import { dismissNotice, getNoticeSet, subscribeNoticeSet, type FlushNotice } from "./decisionFlusher";

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

// A conflict names its sort; only that sort's surface may voice it (a surface
// with no sort, like the results page, never does).
function isForThisSurface(notice: FlushNotice, sessionId: string | undefined): boolean {
  return notice.kind !== "session_conflict" || notice.sessionId === sessionId;
}

/**
 * The quiet person-side notice slot (one always-mounted live region), fed by the
 * engine's sticky notices: AT MOST one non-blocking line per notice kind — a whole
 * drain's worth of rejections (or N quarantined entries) collapses to a single
 * sentence. `auth_required` offers Sign in (back to this page) and is not
 * dismissible: signing in is the action, and a later save clears it.
 * `session_conflict` offers Reload, and shows only on the surface of the sort it
 * names (`sessionId`). The rest offer Okay, which dismisses the line everywhere.
 * Mounted OUTSIDE the round's content swap so it survives the round-end recap
 * ("no later than the revert", F9). The engine never renders; this is its only
 * voice. `PendingDecisionsGate` reuses the same slot (Task 15).
 */
export function PendingNotices({ sessionId }: { sessionId?: string } = {}) {
  // Read at render (no mount-effect gap); a clear (a 2xx, dismissNotice) removes
  // the line from every mounted surface.
  const notices = useSyncExternalStore(subscribeNoticeSet, getNoticeSet, getNoticeSet);
  const pathname = usePathname();

  const visible = notices
    .filter((notice) => isForThisSurface(notice, sessionId))
    .map((notice) => notice.kind)
    .filter(isNoticed);

  // ONE region, mounted empty, so a line that lands is announced (a live region that appears
  // with its text is not). aria-atomic=false: only the new line is read, not the whole set.
  return (
    <div role="status" aria-live="polite" aria-atomic="false" className="space-y-2 empty:mb-0">
      {visible.map((kind) => (
        <p
          key={kind}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-content-soft px-4 py-2 text-sm text-ink-soft"
        >
          <span>{NOTICE_COPY[kind]}</span>
          {kind === "auth_required" ? (
            <Link href={`/login?callbackUrl=${encodeURIComponent(pathname ?? "/")}`} className={quietLink}>
              Sign in
            </Link>
          ) : kind === "session_conflict" ? (
            <button type="button" onClick={() => location.reload()} className={quietLink}>
              Reload
            </button>
          ) : (
            <button type="button" onClick={() => dismissNotice(kind)} className={quietLink}>
              Okay
            </button>
          )}
        </p>
      ))}
    </div>
  );
}
