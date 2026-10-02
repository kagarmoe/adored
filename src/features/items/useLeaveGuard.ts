"use client";
import { useEffect } from "react";

export const LEAVE_PROMPT = "You have changes that aren't saved yet. Leave anyway?";
const GUARD = "__adoredLeaveGuard";
let activeGuards = 0;

/** For in-app exits the guard can't see (a router.push after an action): true when
 *  nothing is unsaved, or the curator chooses to leave anyway. */
export const confirmLeave = () => activeGuards === 0 || window.confirm(LEAVE_PROMPT);

// App Router has no route-change event, so guard the ways out directly: a full unload,
// a same-origin link click (capture phase, before Next's <Link> handler), and — best
// effort — Back, by parking a duplicate of this history entry for Back to land on first.
export function useLeaveGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    activeGuards++;
    // Spread the existing state so Next's router keys survive on the duplicate entry.
    const arm = () =>
      window.history.pushState({ ...window.history.state, [GUARD]: true }, "", window.location.href);
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.origin !== window.location.origin) return;
      if (!window.confirm(LEAVE_PROMPT)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const stop = () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("click", onClick, true);
    };
    function onPop() {
      if (!window.confirm(LEAVE_PROMPT)) return arm();
      stop(); // our own back() must not ask twice
      window.history.back();
    }
    if (!window.history.state?.[GUARD]) arm();
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("popstate", onPop);
    document.addEventListener("click", onClick, true);
    return () => {
      activeGuards--;
      stop();
      // Saved (or unmounted) while still on the guard entry: drop it, so the next Back
      // isn't spent on a duplicate of this page. After a link navigation the current
      // entry is the new page's, so this never fires there.
      if (window.history.state?.[GUARD]) window.history.back();
    };
  }, [active]);
}
