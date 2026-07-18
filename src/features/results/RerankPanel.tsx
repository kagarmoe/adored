"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RankBucket } from "@/types";
import { Button, CardImage } from "@/components/ui";
import {
  PUT_IN_ORDER,
  DONE_ARRANGING,
  BACK_TO_COMPUTED,
  MAKE_A_REVISION,
  DRAFT_SHAPE_FRAMING,
  HANDORDER_ONWARD_LABEL,
  HANDORDER_ONWARD_CAPTION,
  ZONE_LOVED_LABEL,
  ZONE_ONWARD_LABEL,
  moveUpLabel,
  moveDownLabel,
  dragHandleLabel,
  movedAnnouncement,
  movedToOnwardAnnouncement,
  movedToRankingAnnouncement,
} from "@/features/results/rerank-copy";

/** A serializable ranked row for the reorder list. The page resolves the item
 *  name + cover URL server-side (the client never touches the photo store or the
 *  raw item), and passes computedRank + computedBucket so "Back to the suggested
 *  order" can revert optimistically and the client can compute each row's target
 *  manualBucket on a cross-tier move without waiting on a response. */
export interface RerankRow {
  rid: string;
  itemId: string;
  name: string;
  coverUrl?: string;
  /** Single-glyph avatar for when there's no cover (`itemInitial(item)`) — the
   *  same absence language as ItemCard's fallback, so a photo-less item never
   *  renders a bare blank box here. */
  initial: string;
  computedRank: number;
  computedBucket: RankBucket;
}

interface RerankPanelProps {
  resultId: string;
  /** slug or id — the segment the revision route navigates to. */
  collectionId: string;
  status: "draft" | "finalized";
  /** Rows in display order: the `lovedCount` loved rows first, then the onward rows. */
  rows: RerankRow[];
  /** How many leading rows are loved — seeds the sentinel (Onward divider) position. */
  lovedCount: number;
  /** Whether the viewer is the result's curator. Gates the finalized-branch
   *  "Make a revision" affordance so a non-curator collaborator is never offered
   *  to fork another curator's keepsake (mirrors the SharePanel curator gate). */
  canRevise?: boolean;
  /** The normal (bucketed) results composition, shown when not reordering. */
  children: React.ReactNode;
}

const GENTLE_FAIL =
  "That didn't hold just now — nothing was lost. Try again whenever you like.";

/** 9v1f.1: the hand-order surface is ONE ordered sequence of rows plus a single
 *  sentinel that marks the loved↔onward boundary. Zone is DERIVED purely from a
 *  row's position relative to the sentinel (before = loved, after = onward), so
 *  manualRank (position) and zone can never disagree — the sequence is monotonic
 *  by construction (adversarial-review R1/R2). Moving a row past the sentinel is
 *  how a cross-tier move happens, for both drag and the keyboard/AT buttons. */
type SeqEntry = { kind: "row"; row: RerankRow } | { kind: "sentinel" };

/** Move the element at `from` to index `to`, returning a new array. */
function reorder<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function buildSeq(rows: RerankRow[], lovedCount: number): SeqEntry[] {
  const rowEntry = (row: RerankRow): SeqEntry => ({ kind: "row", row });
  return [
    ...rows.slice(0, lovedCount).map(rowEntry),
    { kind: "sentinel" },
    ...rows.slice(lovedCount).map(rowEntry),
  ];
}

/** The suggested (computed) sequence: rows by computedRank, split by computedBucket. */
function computedSeq(rows: RerankRow[]): SeqEntry[] {
  const sorted = [...rows].sort((a, b) => a.computedRank - b.computedRank);
  const loved = sorted.filter((r) => r.computedBucket !== "low");
  return buildSeq(
    [...loved, ...sorted.filter((r) => r.computedBucket === "low")],
    loved.length,
  );
}

/** The full manual overlay this sequence describes: a dense 1-indexed manualRank
 *  across BOTH zones, and a manualBucket per row that is null on the row's computed
 *  side (badge preserved) or the canonical target bucket when hand-crossed. The
 *  payload fully describes every row so a stale override never lingers (R4). */
function toPayload(seq: SeqEntry[]): { rid: string; manualRank: number; manualBucket: RankBucket | null }[] {
  const out: { rid: string; manualRank: number; manualBucket: RankBucket | null }[] = [];
  let rank = 0;
  let onward = false;
  for (const e of seq) {
    if (e.kind === "sentinel") {
      onward = true;
      continue;
    }
    rank += 1;
    const computedOnward = e.row.computedBucket === "low";
    const manualBucket: RankBucket | null =
      onward === computedOnward ? null : onward ? "low" : "medium";
    out.push({ rid: e.row.rid, manualRank: rank, manualBucket });
  }
  return out;
}

/** A row's 1-based position among rows, and whether it sits in the onward group. */
function locate(seq: SeqEntry[], rid: string): { position: number; onward: boolean; total: number } {
  let position = 0;
  let onward = false;
  let seenSentinel = false;
  let total = 0;
  let found = { position: 0, onward: false };
  for (const e of seq) {
    if (e.kind === "sentinel") {
      seenSentinel = true;
      continue;
    }
    total += 1;
    if (e.row.rid === rid) found = { position: total, onward: seenSentinel };
  }
  position = found.position;
  onward = found.onward;
  return { position, onward, total };
}

/**
 * Epic S S3b + 9v1f.1: the manual re-rank surface on the DRAFT result page.
 *
 * - "Adjust results" flips the bucketed composition into ONE ordered list
 *   spanning both tiers, with a sentinel marking the Onward boundary (native HTML5
 *   draggable; ≥44px handles; no swiping).
 * - Per-row move-up / move-down buttons are the AA keyboard/AT path (≥44px,
 *   disabled only at the sequence ends, focus stays on the moved control). Moving a
 *   row across the sentinel crosses tiers — the empty-zone case is reachable because
 *   the sentinel can sit at either end.
 * - Every reorder (drag OR button) recomputes a dense manualRank + a manualBucket
 *   per row and issues ONE bulk PATCH; the optimistic order reverts wholesale on
 *   failure (single atomic call = clean rollback).
 * - A finalized result shows NO reorder affordance — reorder is a draft activity —
 *   and instead offers "Make a revision" (the supersede flow).
 */
export function RerankPanel({ resultId, collectionId, status, rows, lovedCount, canRevise = false, children }: RerankPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "reorder">("view");
  const [seq, setSeq] = useState<SeqEntry[]>(() => buildSeq(rows, lovedCount));
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  // After a keyboard move the React re-render blows away focus; restore it to the
  // moved row's same-direction control (or the opposite one if that end is now
  // disabled), so a keyboard/AT user is never dropped back to the top (§4.3).
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{ rid: string; dir: "up" | "down" } | null>(null);

  useEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    const same = buttonRefs.current.get(`${want.rid}:${want.dir}`);
    const other = buttonRefs.current.get(`${want.rid}:${want.dir === "up" ? "down" : "up"}`);
    const target = same && !same.disabled ? same : other && !other.disabled ? other : null;
    if (target) {
      pendingFocus.current = null;
      target.focus();
    }
  }, [seq, busy]);

  const persist = useCallback(
    async (next: SeqEntry[], announceMsg: string) => {
      const prev = seq;
      setSeq(next);
      setAnnounce(announceMsg);
      setBusy(true);
      try {
        const res = await fetch(`/api/sort-results/${resultId}/items`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: toPayload(next) }),
        });
        if (!res.ok) throw new Error("reorder failed");
        router.refresh();
      } catch {
        setSeq(prev); // clean rollback — one call, one revert (§4.3)
        setAnnounce(GENTLE_FAIL);
      } finally {
        setBusy(false);
      }
    },
    [seq, resultId, router],
  );

  /** Announcement naming the destination when the move crossed the sentinel. */
  function announcementFor(next: SeqEntry[], row: RerankRow, prevOnward: boolean): string {
    const { position, onward, total } = locate(next, row.rid);
    if (onward !== prevOnward) {
      return onward
        ? movedToOnwardAnnouncement(row.name, position, total)
        : movedToRankingAnnouncement(row.name, position, total);
    }
    return movedAnnouncement(row.name, position, total);
  }

  function moveByButton(index: number, dir: "up" | "down") {
    const to = dir === "up" ? index - 1 : index + 1;
    if (to < 0 || to >= seq.length) return;
    const entry = seq[index];
    if (entry.kind !== "row") return;
    const prevOnward = locate(seq, entry.row.rid).onward;
    pendingFocus.current = { rid: entry.row.rid, dir };
    const next = reorder(seq, index, to);
    void persist(next, announcementFor(next, entry.row, prevOnward));
  }

  function handleDrop(index: number) {
    const from = draggingIndex;
    setDraggingIndex(null);
    if (from === null || from === index) return;
    const entry = seq[from];
    if (entry.kind !== "row") return; // the sentinel is not draggable
    const prevOnward = locate(seq, entry.row.rid).onward;
    const next = reorder(seq, from, index);
    void persist(next, announcementFor(next, entry.row, prevOnward));
  }

  async function resetToComputed() {
    const prev = seq;
    setSeq(computedSeq(rows));
    setAnnounce(BACK_TO_COMPUTED);
    setBusy(true);
    try {
      const res = await fetch(`/api/sort-results/${resultId}/items`, { method: "DELETE" });
      if (!res.ok) throw new Error("reset failed");
      router.refresh(); // re-render the server-composed keepsake at the reset order
    } catch {
      setSeq(prev);
      setAnnounce(GENTLE_FAIL);
    } finally {
      setBusy(false);
    }
  }

  // The live-region announcer is always mounted so a move made just before a
  // mode flip is still spoken.
  const announcer = (
    <p role="status" aria-live="polite" className="sr-only">
      {announce}
    </p>
  );

  if (status === "finalized") {
    // §4.4 finalized guard: no reorder affordance — reorder is a draft activity —
    // offer the existing supersede flow instead, but ONLY to the curator (mirrors
    // the SharePanel curator gate). A non-curator collaborator sees the keepsake,
    // never an affordance to fork someone else's result.
    return (
      <div className="space-y-6">
        {canRevise && (
          <div>
            <RevisionButton resultId={resultId} collectionId={collectionId} />
          </div>
        )}
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setMode((m) => (m === "view" ? "reorder" : "view"))}
        >
          {mode === "view" ? PUT_IN_ORDER : DONE_ARRANGING}
        </Button>
        {mode === "reorder" && (
          <Button type="button" variant="ghost" onClick={resetToComputed} disabled={busy}>
            {BACK_TO_COMPUTED}
          </Button>
        )}
      </div>

      {announcer}

      {mode === "reorder" ? (
        <section aria-label={PUT_IN_ORDER} className="space-y-3">
          <p className="text-ink-soft">{DRAFT_SHAPE_FRAMING}</p>
          <ol className="space-y-2">
            {(() => {
              const sentinelIndex = seq.findIndex((e) => e.kind === "sentinel");
              return seq.map((entry, i) => {
                if (entry.kind === "sentinel") {
                  // The Onward boundary — a REAL, AT-perceivable divider (an <li>,
                  // valid inside <ol>), not a hairline. Rows move across it to cross
                  // tiers; it is also a drop target so a drag can land at the boundary.
                  return (
                    <li
                      key="sentinel"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(i)}
                      data-testid="rerank-onward-divider"
                      className="flex flex-col gap-0.5 border-t border-hairline pt-3"
                    >
                      <span className="text-sm font-medium text-ink">{HANDORDER_ONWARD_LABEL}</span>
                      <span className="text-sm text-ink-soft">{HANDORDER_ONWARD_CAPTION}</span>
                    </li>
                  );
                }
                const { row } = entry;
                const onward = i > sentinelIndex;
                return (
                  <li
                    key={row.rid}
                    draggable={!busy}
                    onDragStart={() => setDraggingIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(i)}
                    onDragEnd={() => setDraggingIndex(null)}
                    data-testid="rerank-row"
                    data-zone={onward ? "onward" : "loved"}
                    className={`flex items-center gap-3 rounded-card border border-hairline bg-content p-2 transition-transform duration-200 ease-gentle motion-reduce:transition-none ${
                      draggingIndex === i ? "opacity-60" : ""
                    }`}
                  >
                    <span
                      aria-hidden
                      title={dragHandleLabel(row.name)}
                      className="flex h-11 w-11 shrink-0 cursor-grab items-center justify-center text-lg text-ink-soft"
                    >
                      ⠿
                    </span>
                    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-content-soft">
                      <CardImage
                        src={row.coverUrl}
                        alt=""
                        fallback={
                          <span className="font-display text-lg text-ink-soft" aria-hidden>
                            {row.initial}
                          </span>
                        }
                      />
                    </div>
                    <span className="flex-1 truncate text-ink">{row.name}</span>
                    {/* Group membership, perceivable on static AT navigation (R3). */}
                    <span className="sr-only">{onward ? ZONE_ONWARD_LABEL : ZONE_LOVED_LABEL}</span>
                    <button
                      type="button"
                      aria-label={moveUpLabel(row.name)}
                      disabled={i === 0 || busy}
                      onClick={() => moveByButton(i, "up")}
                      ref={(el) => {
                        if (el) buttonRefs.current.set(`${row.rid}:up`, el);
                        else buttonRefs.current.delete(`${row.rid}:up`);
                      }}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink hover:bg-content-soft focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span aria-hidden>↑</span>
                    </button>
                    <button
                      type="button"
                      aria-label={moveDownLabel(row.name)}
                      disabled={i === seq.length - 1 || busy}
                      onClick={() => moveByButton(i, "down")}
                      ref={(el) => {
                        if (el) buttonRefs.current.set(`${row.rid}:down`, el);
                        else buttonRefs.current.delete(`${row.rid}:down`);
                      }}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink hover:bg-content-soft focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span aria-hidden>↓</span>
                    </button>
                  </li>
                );
              });
            })()}
          </ol>
        </section>
      ) : (
        children
      )}
    </div>
  );
}

/** The finalized keepsake's "Make a revision" affordance — POSTs the supersede
 *  flow and routes to the fresh draft (mirrors FinalizeEntry's shape). */
function RevisionButton({ resultId, collectionId }: { resultId: string; collectionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sort-results/${resultId}/supersede`, { method: "POST" });
      if (!res.ok) throw new Error("supersede failed");
      const draft = await res.json();
      router.push(`/collections/${collectionId}/results/${draft.number}`);
    } catch {
      setError(GENTLE_FAIL);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="secondary" onClick={handleClick} disabled={busy}>
        {busy ? "Getting ready…" : MAKE_A_REVISION}
      </Button>
      {error && (
        <p className="text-sm text-ink-soft" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
