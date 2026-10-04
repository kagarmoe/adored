"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { quietLink } from "@/lib/design/quiet-link";
import { dismissNotice, getNoticeSet, noticeKey, subscribeNoticeSet, type FlushNotice } from "./decisionFlusher";

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
export const CLOSED_SESSION_DISCARDED_NOTICE =
  "A sort that was wrapped up somewhere else still had a few answers waiting, and those didn't make it in";
export const DISPOSITION_SUPERSEDED_NOTICE = "Anything that already had a feeling from you stays where you placed it";

// Every kind the engine can raise has words, or this does not compile (purses-w7ss.33).
const NOTICE_COPY: Record<FlushNotice["kind"], string> = {
  rejected_unknown_item: REJECTED_NOTICE,
  quarantined: QUARANTINE_NOTICE,
  session_conflict: SESSION_CONFLICT_NOTICE,
  closed_session_discarded: CLOSED_SESSION_DISCARDED_NOTICE,
  disposition_superseded: DISPOSITION_SUPERSEDED_NOTICE,
  auth_required: AUTH_REQUIRED_NOTICE,
};

// A line belongs to the collection whose answers raised it (one with no collection predates
// stamping and shows anywhere); a conflict also names its sort. Two lines are global and show on
// every surface: auth_required (signing in is per person) and closed_session_discarded (answers that
// are gone must never wait for a page the person may not open) (purses-w7ss.31).
function isForThisSurface(notice: FlushNotice, collectionId: string, sessionId: string | undefined): boolean {
  if (notice.kind === "auth_required" || notice.kind === "closed_session_discarded") return true;
  if (notice.collectionId !== undefined && notice.collectionId !== collectionId) return false;
  return notice.kind !== "session_conflict" || notice.sessionId === sessionId;
}

/**
 * The quiet person-side notice slot (one always-mounted live region), fed by the
 * engine's sticky notices: AT MOST one non-blocking line per notice kind (and collection) — a whole
 * drain's worth of rejections (or N quarantined entries) collapses to a single
 * sentence. `auth_required` offers Sign in (back to this page) and is not
 * dismissible: signing in is the action, and a later save clears it.
 * `session_conflict` offers Reload, and shows only on the surface of the sort it
 * names (`sessionId`). Every other line (including `closed_session_discarded` and
 * `disposition_superseded`, a set-aside a feeling had already settled) offers Okay,
 * which dismisses it on every surface.
 * Every line shows only on its own collection's surfaces, except two global ones:
 * `auth_required` and `closed_session_discarded` (a recovery-time 409; no surface
 * belongs to the closed sort, and lost answers must be heard).
 * Mounted OUTSIDE the round's content swap so it survives the round-end recap
 * ("no later than the revert", F9). The engine never renders; this is its only
 * voice. `PendingDecisionsGate` reuses the same slot.
 */
export function PendingNotices({ collectionId, sessionId }: { collectionId: string; sessionId?: string }) {
  // Read at render (no mount-effect gap); a clear (a 2xx, dismissNotice) removes
  // the line from every mounted surface.
  const notices = useSyncExternalStore(subscribeNoticeSet, getNoticeSet, getNoticeSet);
  const pathname = usePathname();
  const visible = notices.filter((notice) => isForThisSurface(notice, collectionId, sessionId));

  // ONE region, mounted empty, so a line that lands is announced (a live region that appears
  // with its text is not). aria-atomic=false: only the new line is read, not the whole set.
  return (
    <div role="status" aria-live="polite" aria-atomic="false" className="space-y-2 empty:mb-0">
      {visible.map((notice) => (
        <p
          key={noticeKey(notice)}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-content-soft px-4 py-2 text-sm text-ink-soft"
        >
          <span>{NOTICE_COPY[notice.kind]}</span>
          {notice.kind === "auth_required" ? (
            <Link href={`/login?callbackUrl=${encodeURIComponent(pathname ?? "/")}`} className={quietLink}>
              Sign in
            </Link>
          ) : notice.kind === "session_conflict" ? (
            <button type="button" onClick={() => location.reload()} className={quietLink}>
              Reload
            </button>
          ) : (
            <button type="button" onClick={() => dismissNotice(notice)} className={quietLink}>
              Okay
            </button>
          )}
        </p>
      ))}
    </div>
  );
}
