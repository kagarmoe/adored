"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";
import { Card } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { DecisionControls } from "./DecisionControls";
import { triageDecisions, type TriageResult } from "./roundCopy";
import { DeferControl } from "./DeferControl";
import { SetAsideButton } from "./SetAsideButton";
import { useOptionalTriageUndo } from "./TriageUndoProvider";
import { enqueue, newClientKey } from "./decisionQueue";
import { drain, triggerFlush } from "./decisionFlusher";
import { STUMBLE_LINE, useOptimisticRound } from "./useOptimisticRound";
import { PendingNotices } from "./pendingNotices";
import { SortProgress } from "./SortProgress";

export interface TriageRoundQueueEntry {
  item: Item;
  deferred: boolean;
  heroPhotoUrl?: string;
}

const add = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => new Set(set).add(id);
const without = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  const next = new Set(set);
  next.delete(id);
  return next;
};

interface TriageRoundProps {
  curatorId: string;
  sessionId: string;
  /** ULID collection.id — the queue key + disposition endpoint (never the slug). */
  collectionId: string;
  /** collection.slug ?? collection.id — ItemCard's link base. */
  collectionSlugOrId: string;
  /** chooseSortPhase's feelings queue: active pieces first, then Not yet ones. */
  queue: TriageRoundQueueEntry[];
  /** Live pieces already placed before this visit (the progress seed). */
  placedSeed: number;
  /** Where the phase hands off once every piece has passed through (…/sort?phase=pairs). */
  nextHref: string;
}

/**
 * The feelings phase (spec §4): "How do you feel about this one?" for every live
 * piece, once. Answers advance from local state (persist-before-advance); Not yet
 * sends a piece to the end of the phase, and a second Not yet lets it rest; Not
 * mine sets it aside (with Bring back). When every piece has passed through, the
 * answers are landed and the screen hands off to pairs.
 */
export function TriageRound({ curatorId, sessionId, collectionId, collectionSlugOrId, queue, placedSeed, nextHref }: TriageRoundProps) {
  const router = useRouter();
  const [seed] = useState(placedSeed);
  const [deferredAtMount] = useState(() => new Set(queue.filter((e) => e.deferred).map((e) => e.item.id)));
  const [entries, setEntries] = useState<TriageRoundQueueEntry[]>(queue);
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
  const [placed, setPlaced] = useState<ReadonlySet<string>>(new Set());
  const [escaped, setEscaped] = useState<ReadonlySet<string>>(new Set());
  const undoCtx = useOptionalTriageUndo();

  const current = entries.find((e) => !handled.has(e.item.id));
  const round = useOptimisticRound({ curatorId, sessionId, collectionId });
  const { key, revisit } = round;
  // Mounted empty so the region exists before its text changes (SC 4.1.3).
  const [announcement, setAnnouncement] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const backControl = useRef<HTMLButtonElement>(null);
  const focusAfterUndo = useRef(false);

  // Bring back (provider's undo cleared) returns the piece to this phase.
  const lastUndoRef = useRef(undoCtx?.undo ?? null);
  const undoNow = undoCtx?.undo ?? null;
  useEffect(() => {
    const prev = lastUndoRef.current;
    lastUndoRef.current = undoNow;
    if (prev === null || undoNow !== null || !handled.has(prev.itemId)) return;
    setHandled((h) => without(h, prev.itemId));
    setEscaped((e) => without(e, prev.itemId));
  }, [undoNow, handled]);

  const revisitEntry = revisit === null ? undefined : entries.find((e) => e.item.id === revisit.itemId);
  const shown = revisitEntry ?? current;

  // Undo of the only queued answer takes its control away; land on the question.
  useEffect(() => {
    if (!focusAfterUndo.current) return;
    focusAfterUndo.current = false;
    if (!backControl.current) heading.current?.focus();
  });

  // Every piece has passed through: land the answers, then on to pairs (once).
  const handedOff = useRef(false);
  useEffect(() => {
    if (shown !== undefined || handedOff.current) return;
    handedOff.current = true;
    void drain([key]).finally(() => router.replace(nextHref));
  }, [shown, key, nextHref, router]);

  async function handleTriage(target: Item, decision: { itemId: string; result: TriageResult }): Promise<boolean> {
    if (!(await round.submitDecision(target.id, decision))) return false;
    setPlaced((p) => add(p, target.id));
    setEscaped((e) => without(e, target.id));
    setHandled((h) => add(h, target.id));
    return true;
  }

  // The piece changes under the person's focus, so say which one is in front of them.
  function undo() {
    const back = round.goBack();
    if (back === null) return;
    const name = entries.find((e) => e.item.id === back.itemId)?.item.name ?? "";
    if (!back.fresh) {
      setAnnouncement(`Back to ${name}. You placed this with ${back.label} — change it?`);
      return;
    }
    setPlaced((p) => without(p, back.itemId));
    setHandled((h) => without(h, back.itemId));
    setAnnouncement(`Back to ${name}.`);
    focusAfterUndo.current = true;
  }

  function keepGoing() {
    round.clearRevisit();
    if (current) setAnnouncement(`Back to ${current.item.name}.`);
  }

  async function handleNotYet(target: TriageRoundQueueEntry) {
    setEscaped((e) => add(e, target.item.id));
    if (target.deferred) {
      // Already waited once this visit (or came back waiting): let it rest so the phase can end.
      setHandled((h) => add(h, target.item.id));
      return;
    }
    const persisted = await enqueue(
      key,
      { kind: "disposition", clientKey: newClientKey(), itemId: target.item.id, disposition: "deferred", enqueuedAt: new Date().toISOString() },
      () => triggerFlush(key),
    );
    if (persisted === "needs_fallback") {
      try {
        await fetch(`/api/collections/${collectionId}/dispositions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: target.item.id, disposition: "deferred" }),
        });
      } catch {
        // best-effort: the piece still waits at the end and returns next visit
      }
    }
    setEntries((prev) => [...prev.filter((e) => e.item.id !== target.item.id), { ...target, deferred: true }]);
  }

  function handleNotMine(target: Item) {
    if (undoCtx) void undoCtx.setAside(target.id, target.name);
    setEscaped((e) => add(e, target.id));
    setHandled((h) => add(h, target.id));
  }

  // Placed so far over what this visit can still place: pieces placed before it
  // (seed), plus this visit's active pieces, plus any piece that came back waiting
  // and has now been placed (a waiting piece only counts once it is answered, so a
  // second Not yet never leaves a hole), minus the active pieces that left without a
  // feeling (Not yet / Not mine) — they are not "to place" any more this visit.
  const done = seed + placed.size;
  const total =
    seed +
    (queue.length - deferredAtMount.size) +
    [...placed].filter((id) => deferredAtMount.has(id)).length -
    [...escaped].filter((id) => !deferredAtMount.has(id)).length;

  return (
    <div className="space-y-6">
      <SortProgress done={done} total={total} />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <PendingNotices sessionId={sessionId} />
      {shown === undefined ? (
        <p role="status" className="text-sm text-ink-soft">
          Just a moment…
        </p>
      ) : (
        <div className="space-y-6">
          <div>
            <h1 ref={heading} tabIndex={-1} className="text-2xl text-ink focus:outline-hidden sm:text-3xl">
              How do you feel about this one?
            </h1>
            {/* One button that swaps Undo ↔ Keep going, so focus stays put (SC 2.4.3). */}
            {(round.canGoBack || revisit !== null) && (
              <button
                ref={backControl}
                type="button"
                onClick={revisit !== null ? keepGoing : undo}
                className="mt-1 inline-flex h-11 items-center rounded-control text-sm text-ink-soft transition-colors hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:ring-primary"
              >
                {revisit !== null ? "Keep going" : `Undo: ${round.lastLabel}`}
              </button>
            )}
          </div>

          {round.stumble && (
            <p role="status" className="text-sm text-ink-soft">
              {STUMBLE_LINE}
            </p>
          )}

          {shown.deferred && (
            <div className="flex items-center gap-2 rounded-control bg-content-mid px-4 py-3 text-ink">
              <span aria-hidden className="text-lg leading-none">☾</span>
              <p className="text-sm">
                <span className="font-medium">Ready when you are.</span> This one was waiting for you — no rush.
              </p>
            </div>
          )}

          <ItemCard item={shown.item} collectionId={collectionSlugOrId} heroPhotoUrl={shown.heroPhotoUrl} imageClassName="h-64" />
          <Card padding="lg">
            <div className="space-y-4">
              {revisit !== null && (
                <p className="text-sm text-ink-soft">You placed this with {revisit.label} — change it?</p>
              )}
              {/* NOT keyed per piece: a re-keyed region is never announced (SC 4.1.3). */}
              <DecisionControls
                onDecision={(d) => handleTriage(shown.item, d)}
                decisions={triageDecisions(shown.item.id)}
                priorAnswer={revisit?.label}
              />
              {revisit === null && (
                <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-hairline pt-3">
                  <DeferControl onDecision={() => void handleNotYet(shown)} />
                  <SetAsideButton onDecision={() => handleNotMine(shown.item)} />
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
