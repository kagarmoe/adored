"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";
import type { MovedDecision } from "@/lib/what-moved";
import { Button, Card } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { DecisionControls } from "./DecisionControls";
import {
  ROUND_COPY,
  USAGE_PASS_ARIA_LABEL,
  USAGE_PASS_LABEL,
  USAGE_PASS_TITLE,
  QUICK_PACE_LABEL,
  QUICK_INTRO_LINE,
  THIS_ROUND_LABEL,
  nowAnnouncement,
  usageDecisions,
  type UsageResult,
} from "./roundCopy";
import { RoundShell } from "./RoundShell";
import { RoundTimer } from "./RoundTimer";
import { RoundLengthDialog } from "./RoundLengthDialog";
import { WhatMoved } from "./WhatMoved";
import { STUMBLE_LINE, useOptimisticRound } from "./useOptimisticRound";
import { PendingNotices } from "./pendingNotices";
import { useDeviceValue } from "@/lib/useDeviceValue";
import { setRoundBox, type RoundBoxSeconds } from "@/lib/round-preference";
import {
  getUsagePace,
  setUsagePace,
  hasSeenQuickIntro,
  markQuickIntroSeen,
  markUsageRoundRan,
  type UsagePace,
} from "@/lib/usage-round-prefs";

export interface UsageRoundQueueEntry {
  item: Item;
  heroPhotoUrl?: string;
}

interface UsageRoundProps {
  curatorId: string;
  sessionId: string;
  /** ULID collection.id — the queue key + decision endpoint (never the slug). */
  collectionId: string;
  /** collection.slug ?? collection.id — ItemCard's link base. */
  collectionSlugOrId: string;
  /** Server-selected usage-unknown remainder (selectUsageQueue), in round order. */
  queue: UsageRoundQueueEntry[];
  /** Recap server-log prop; the page passes [] (§3.3 — the window filter owns it). */
  decisions: MovedDecision[];
  /** Server-computed usage-known count (usageByItemId.size) — the answered-cue seed. */
  usageKnownSeed: number;
  hubHref: string;
}

/** The answered-count cue's one home ("{n} answered so far", F20). */
export const answeredSoFar = (n: number): string => `${n} answered so far`;

/** The Quick-pace beat (spec §3.5, parent §7.3 tunable): the felt interval after
 *  which an unanswered item auto-passes. Never rendered as a countdown. */
export const QUICK_BEAT_MS = 5_000;

// Focusable, operable chrome the beat must yield to (WCAG 2.2.1). The question
// heading carries tabIndex={-1} (a programmatic focus target, not a tab stop) and
// is excluded so landing focus on it never suspends the beat.
function isInteractiveEl(el: EventTarget | null): el is HTMLElement {
  return (
    el instanceof HTMLElement &&
    el.matches("button, a[href], select, input, textarea, [tabindex]:not([tabindex='-1'])")
  );
}

/**
 * The optimistic usage round (spec §3.4): the SECOND consumer of
 * `useOptimisticRound`. It rides the shared machine for persist-before-advance,
 * the frozen recap + drain-only end sequence (F15), undo-as-revisit (F19), and
 * the round clock — and forks only where usage genuinely differs:
 *
 *  - Three affordances: Yes / Not these days / Skip. No dispositions, no undo
 *    provider (D2).
 *  - `pass` writes NOTHING — no event, no queue entry, no log line: a pass counter
 *    cycles the item to the tail once, and a second pass drops it from the queue
 *    (staying usage-unknown). Termination is provable at ≤ 2n presentation slots.
 *  - Demotion memory: `markUsageRoundRan` is written only when the round ends
 *    WITHOUT engagement — always on queue exhaustion, and on timer expiry only
 *    when no answer landed. Never on Pause / navigation / unmount.
 */
export function UsageRound({
  curatorId,
  sessionId,
  collectionId,
  collectionSlugOrId,
  queue,
  decisions,
  usageKnownSeed,
  hubHref,
}: UsageRoundProps) {
  const router = useRouter();

  // Round-local snapshot (F20). A never-updated state cell IS the mount snapshot, and —
  // unlike a ref — the answered-count cue may read it while rendering.
  const [seed] = useState(usageKnownSeed);
  const [entries, setEntries] = useState<UsageRoundQueueEntry[]>(queue);
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
  const [newlyAnswered, setNewlyAnswered] = useState<ReadonlySet<string>>(new Set());
  // Round-local, ephemeral pass counter — deliberately a ref (nothing renders it,
  // and a crash forgetting it is by design, parent D7).
  const passesRef = useRef(new Map<string, number>());

  // Quick pacing (spec §3.5, parent D2). Pace is device-global, so SSR and the hydration
  // render agree on Relaxed and the stored pace lands right after mount (useDeviceValue —
  // the getRoundBox pattern). The toggle's own choice overrides the stored one, so a
  // failed persist (private mode) still flips the pace in memory. Relaxed is the default, ever.
  const storedPace = useDeviceValue<UsagePace>(getUsagePace, "relaxed");
  const [chosenPace, setChosenPace] = useState<UsagePace | null>(null);
  const pace = chosenPace ?? storedPace;
  const [showQuickIntro, setShowQuickIntro] = useState(false); // first-Quick education (UX-4)
  const [beatSuspended, setBeatSuspended] = useState(false); // focus on chrome holds the beat
  const [nowAnnounce, setNowAnnounce] = useState(""); // role=status advance announcement (c)
  const [lengthDialogOpen, setLengthDialogOpen] = useState(false);
  // Handed to RoundTimer (renders the adjust button) AND RoundLengthDialog
  // (refocuses it on close) — the dialog is a portal, so it can't reach the
  // trigger on its own.
  const adjustButtonRef = useRef<HTMLButtonElement>(null);

  // Focus targets and the advance intent that drives the Quick focus/announce move.
  const rootRef = useRef<HTMLDivElement>(null); // the whole round surface (incl. RoundShell chrome)
  const contentRef = useRef<HTMLDivElement>(null); // the card + heading region (the (b) exception's boundary)
  const headingRef = useRef<HTMLHeadingElement>(null); // the question heading — the WCAG 2.4.3 destination
  // "auto" (beat) vs "manual" (Skip/answer tap) advance — consumed once after the
  // resulting render to announce + move focus. Only set while pace is Quick.
  const advanceIntent = useRef<"auto" | "manual" | null>(null);
  // A Yes/No tap claims its item synchronously (before submit's await) so a beat
  // firing in the same tick resolves to the tap, never a double-advance.
  const claimedRef = useRef<Set<string>>(new Set());

  // Usage's own queue fork: the head not yet handled. Everything about advancing
  // that decision optimistically rides the shared hook.
  const current = entries.find((e) => !handled.has(e.item.id));
  const queueExhausted = current === undefined;
  const round = useOptimisticRound<{ itemId: string; result: UsageResult }>({
    curatorId,
    sessionId,
    collectionId,
    decisionType: "usage",
    serverLog: decisions,
    initialQueueEmpty: queue.length === 0,
    queueExhausted,
    fallbackBody: (decision, clientKey) => ({ type: "usage", decision, clientKey }),
    labelFor: (itemId, decision) =>
      usageDecisions(itemId).find((u) => u.decision.result === decision.result)?.label ??
      decision.result,
    toMoved: (decision, createdAtMs) => ({ type: "usage", createdAt: createdAtMs, decision }),
  });
  const { revisit, expired } = round;

  // Demotion memory (spec §3.8): fire once when the round ends without engagement.
  // Queue exhaustion always writes; a timer-expired round writes only if no answer
  // landed. An in-progress unmount never reaches here (the effect runs on the
  // end-transition, not on cleanup).
  const ranRef = useRef(false);
  // Synchronous "an answer landed this round" flag — set INSIDE handleUsage BEFORE
  // the submit await, so a box expiring mid-flush (the quota fallback awaits a
  // multi-macrotask network POST) can't false-demote on the lagging newlyAnswered
  // state (final review #2). The component never remounts across rounds, so it
  // needs no reset.
  const answeredThisRoundRef = useRef(false);
  const ended = expired || queueExhausted;
  useEffect(() => {
    if (!ended || ranRef.current) return;
    ranRef.current = true;
    if (queueExhausted || !answeredThisRoundRef.current) {
      markUsageRoundRan(curatorId, sessionId);
    }
  }, [ended, queueExhausted, curatorId, sessionId]);

  // While revisiting, the standing item is shown instead of the queue head.
  const revisitEntry = revisit === null ? undefined : entries.find((e) => e.item.id === revisit.itemId);
  const shown = revisitEntry ?? current;

  function advancePast(itemId: string) {
    setHandled((prev) => new Set(prev).add(itemId));
  }

  async function handleUsage(target: Item, decision: { itemId: string; result: UsageResult }) {
    // Claim BEFORE the await so a beat firing in this same tick bails (tap wins).
    claimedRef.current.add(target.id);
    // Engagement is recorded synchronously, before the submit await, so an
    // in-flight expiry can't demote a device whose person actively answered (#2).
    answeredThisRoundRef.current = true;
    if (!(await round.submitDecision(target.id, decision))) {
      claimedRef.current.delete(target.id); // busy/stumble: release so the beat can resume
      return;
    }
    setNewlyAnswered((prev) => new Set(prev).add(target.id)); // idempotent — a re-answer never double-counts
    if (pace === "quick") advanceIntent.current = "manual";
    advancePast(target.id);
  }

  // A pass writes NOTHING: it bumps the round-local counter and either cycles the
  // item to the tail (first showing) or drops it from the queue (second showing,
  // staying usage-unknown). No enqueue, no log, no count.
  function pass(target: Item) {
    const seen = (passesRef.current.get(target.id) ?? 0) + 1;
    passesRef.current.set(target.id, seen);
    if (seen >= 2) {
      advancePast(target.id);
      return;
    }
    setEntries((prev) => {
      const found = prev.find((e) => e.item.id === target.id);
      if (!found) return prev;
      return [...prev.filter((e) => e.item.id !== target.id), found];
    });
  }

  // Latest queue head + pass fn behind refs so the beat effect can arm without
  // listing render-scoped closures in its deps (which would reset the beat every
  // render). Refreshed after EVERY commit — never during render — and declared above
  // their two readers (the beat's timeout, which fires seconds later, and the
  // announce/focus effect, which runs after this one in the same commit).
  const currentRef = useRef(current);
  const passRef = useRef(pass);
  useEffect(() => {
    currentRef.current = current;
    passRef.current = pass;
  });

  // Skip tap: a manual advance in Quick moves focus + announces, exactly like an
  // answer; the write-nothing pass itself is unchanged.
  function handleSkip(target: Item) {
    if (pace === "quick") advanceIntent.current = "manual";
    pass(target);
  }

  // The pace toggle (parent D2/UX-3): quiet, aria-pressed, ≥44px. Leaving Quick is
  // the same toggle. Enabling Quick with the intro unseen shows the education line
  // in THIS commit and marks it seen so later rounds skip it.
  function toggleQuick() {
    const next: UsagePace = pace === "quick" ? "relaxed" : "quick";
    setChosenPace(next);
    setUsagePace(next);
    if (next === "quick" && !hasSeenQuickIntro()) {
      markQuickIntroSeen();
      setShowQuickIntro(true);
    }
  }

  const revisiting = revisit !== null;

  // (a) Suspend the beat while focus is on ANY interactive chrome of the round
  // surface — decision controls, Skip, Back, the toggle, the length-dialog
  // trigger, Pause. focusin/focusout on the root; re-arm restarts the FULL
  // beat (a named choice: restart, not resume). One pair, attached once.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onFocusIn = (e: FocusEvent) => {
      if (isInteractiveEl(e.target)) setBeatSuspended(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      // Re-arm unless focus is moving to more interactive chrome inside the surface.
      const next = e.relatedTarget;
      if (!isInteractiveEl(next) || !root.contains(next)) setBeatSuspended(false);
    };
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // The beat: while Quick, live (not ended, not revisiting), and unsuspended, a
  // single timeout keyed to the current item auto-passes it on fire. Keyed via the
  // item id in deps so a new item re-arms a full beat and cleanup cancels the old.
  const beatItemId = revisiting ? undefined : current?.item.id;
  useEffect(() => {
    if (pace !== "quick" || expired || revisiting || beatSuspended || beatItemId === undefined) return;
    const id = setTimeout(() => {
      // Resolve the tap-race: an answered/answering item was already claimed, and a
      // stale target (the head moved on) is ignored.
      if (claimedRef.current.has(beatItemId)) return;
      if (currentRef.current?.item.id !== beatItemId) return;
      advanceIntent.current = "auto";
      passRef.current(currentRef.current.item);
    }, QUICK_BEAT_MS);
    return () => clearTimeout(id);
  }, [pace, expired, revisiting, beatSuspended, beatItemId]);

  // (b)+(c) After a Quick advance: announce the new item ("Now: {name}") and move
  // focus to the question heading (WCAG 2.4.3) — EXCEPT an auto-pass never steals
  // focus that sits on interactive chrome outside the card/heading region (should
  // (a)'s listener have missed it). Consumed once via the advance-intent ref.
  useEffect(() => {
    if (pace !== "quick") {
      advanceIntent.current = null;
      return;
    }
    const intent = advanceIntent.current;
    advanceIntent.current = null;
    if (intent === null) return;
    const item = currentRef.current;
    if (item === undefined) return;
    setNowAnnounce(nowAnnouncement(item.item.name ?? ""));
    const active = document.activeElement;
    const chromeOutsideCard =
      intent === "auto" && isInteractiveEl(active) && !(contentRef.current?.contains(active) ?? false);
    if (!chromeOutsideCard) headingRef.current?.focus();
  }, [beatItemId, pace]);

  // The round's back affordance: the shared machine decides queued vs standing vs
  // no-op. A queued undo comes back here to un-advance the item and decrement this
  // round's count (F20) — the two pieces of state the hook never owns.
  function goBack() {
    const fresh = round.goBack();
    if (fresh === null) return;
    claimedRef.current.delete(fresh.itemId); // re-presented fresh — the beat may act on it again
    passesRef.current.delete(fresh.itemId); // reset the pass budget so a re-presented item cycles, not drops
    setNewlyAnswered((prev) => {
      const next = new Set(prev);
      next.delete(fresh.itemId);
      return next;
    });
    setHandled((prev) => {
      const next = new Set(prev);
      next.delete(fresh.itemId);
      return next;
    });
  }

  // Ceiling-free cue (F20): seed + this round's answered set. Ticks on the tap,
  // never on a pass or the flush.
  const answered = seed + newlyAnswered.size;

  const roundOver = shown === undefined || expired;
  const currentBox: RoundBoxSeconds = round.boxMs === null ? "none" : ((round.boxMs / 1000) as RoundBoxSeconds);
  const timer = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <RoundTimer
          startedAtMs={round.startedAtMs}
          boxMs={round.boxMs}
          onExpire={round.onExpire}
          roundLabel={THIS_ROUND_LABEL}
          onAdjust={!roundOver ? () => setLengthDialogOpen(true) : undefined}
          adjustButtonRef={adjustButtonRef}
        />
      </div>
    </div>
  );

  return (
    <div ref={rootRef}>
      <RoundShell
        step={2}
        totalSteps={4}
        roundLabel={THIS_ROUND_LABEL}
        timer={timer}
        onPause={() => router.push(hubHref)}
      >
      {/* The flush engine's one quiet voice — OUTSIDE the content swap so a notice
          raised mid-round survives into the recap (F9). */}
      <div className="mx-auto max-w-xl">
        <PendingNotices />
      </div>
      {roundOver ? (
        <WhatMoved
          decisions={round.recapDecisions}
          windowStartMs={round.windowStartMs}
          nowMs={round.recapNowMs}
          hubHref={hubHref}
          hadTimer={round.boxMs !== null}
        />
      ) : (
        <div className="mx-auto max-w-xl space-y-6">
          {/* (c) Visually-hidden advance announcement — distinct from RoundTimer's
              live region. "Now: {item name}" on each Quick advance. */}
          <div role="status" className="sr-only">
            {nowAnnounce}
          </div>

          {/* Pace toggle + first-Quick education: chrome, ABOVE the card, OUTSIDE
              the contentRef region so the (b) exception treats the toggle as
              chrome. A quiet control (parent D2/UX-3): aria-pressed, ≥44px. */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={toggleQuick}
              aria-pressed={pace === "quick"}
              className="inline-flex h-11 items-center rounded-control border border-hairline px-3 text-sm text-ink-soft transition-colors hover:text-ink aria-pressed:border-ink aria-pressed:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
            >
              {QUICK_PACE_LABEL}
            </button>
            {showQuickIntro && (
              <p role="status" className="text-sm text-ink-soft">
                {QUICK_INTRO_LINE}
              </p>
            )}
          </div>

          <div ref={contentRef} className="space-y-6">
          <div>
            <h1 ref={headingRef} tabIndex={-1} className="text-3xl text-ink">
              {ROUND_COPY.usage.name}
            </h1>
            {answered > 0 && (
              <p className="mt-2 text-sm text-ink-soft">{answeredSoFar(answered)}</p>
            )}
            {/* Undo-as-revisit: a quiet single step back, never a rewind. */}
            {round.canGoBack && (
              <p className="mt-1">
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex h-11 items-center gap-1 rounded-control text-sm text-ink-soft transition-colors hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
                >
                  <span aria-hidden>←</span> Back
                </button>
              </p>
            )}
          </div>

          {/* Persistently mounted, fixed-height: (1) a role=status region that
              appears WITH its text is not reliably announced — AT only reads
              mutations to a region it was already observing (see the live-region
              memory / SC 4.1.3); (2) conditionally rendering it SHIFTED the card
              and the answer buttons below it when `stumble` toggled — content
              jumping under a finger in a tap-first product, and the cause of an
              intermittent e2e click landing on the card image (purses-q228). */}
          <p role="status" className="min-h-5 text-sm text-ink-soft">
            {round.stumble ? STUMBLE_LINE : ""}
          </p>

          {/* (d) The card swap — CSS transition only, with motion-reduce:transition-none
              (the house pattern). Reduced motion cannot suppress the beat: the advance
              is a timeout, unaffected by this class. Keyed so the swap animates. */}
          <div
            key={shown.item.id}
            className="transition-opacity duration-300 ease-gentle motion-reduce:transition-none"
          >
            <ItemCard
              item={shown.item}
              collectionId={collectionSlugOrId}
              heroPhotoUrl={shown.heroPhotoUrl}
              imageClassName="h-64"
            />
          </div>
          <Card padding="lg">
            <div className="space-y-4">
              {revisit !== null && (
                <p className="text-sm text-ink-soft">
                  You placed this with {revisit.label} — change it?
                </p>
              )}
              {/* Not keyed per item — see TriageRound: re-keying remounts the
                  sr-only live region, and a region that appears with its content
                  is never announced (SC 4.1.3). */}
              <DecisionControls
                submit={{ kind: "local", onDecision: (d) => void handleUsage(shown.item, d) }}
                type="usage"
                decisions={usageDecisions(shown.item.id)}
                priorAnswer={revisit?.label}
              />
              {revisit === null ? (
                /* The demoted-escape slot: an always-available, write-nothing pass.
                   Its contract lives in the accessible name (WCAG 2.5.3). */
                <div className="border-t border-hairline pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleSkip(shown.item)}
                    title={USAGE_PASS_TITLE}
                    aria-label={USAGE_PASS_ARIA_LABEL}
                  >
                    {USAGE_PASS_LABEL}
                  </Button>
                </div>
              ) : (
                /* A standing answer can't be passed — offer a gentle way to resume. */
                <div className="border-t border-hairline pt-3">
                  <Button type="button" variant="ghost" onClick={round.clearRevisit}>
                    Keep going
                  </Button>
                </div>
              )}
            </div>
          </Card>
          </div>
        </div>
      )}
      <RoundLengthDialog
        open={lengthDialogOpen}
        initial={currentBox}
        onCommit={(box) => {
          setRoundBox(box); // persist for the next round…
          round.onBoxChange(box); // …and re-arm THIS round against its unchanged start
        }}
        onClose={() => setLengthDialogOpen(false)}
        returnFocusRef={adjustButtonRef}
      />
      </RoundShell>
    </div>
  );
}
