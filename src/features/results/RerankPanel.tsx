"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, CardImage } from "@/components/ui";
import {
  PUT_IN_ORDER,
  DONE_ARRANGING,
  BACK_TO_COMPUTED,
  MAKE_A_REVISION,
  DRAFT_SHAPE_FRAMING,
  moveUpLabel,
  moveDownLabel,
  dragHandleLabel,
  movedAnnouncement,
} from "@/features/results/rerank-copy";

/** A serializable ranked row for the reorder list. The page resolves the item
 *  name + cover URL server-side (the client never touches the photo store or the
 *  raw item), and passes computedRank so "Back to the computed order" can revert
 *  optimistically without waiting on the DELETE response. */
export interface RerankRow {
  rid: string;
  itemId: string;
  name: string;
  coverUrl?: string;
  computedRank: number;
}

interface RerankPanelProps {
  resultId: string;
  /** slug or id — the segment the revision route navigates to. */
  collectionId: string;
  status: "draft" | "finalized";
  /** Rows in current display order (manualRank ?? computedRank). */
  rows: RerankRow[];
  /** The normal (bucketed) results composition, shown when not reordering. */
  children: React.ReactNode;
}

const GENTLE_FAIL =
  "That didn't hold just now — nothing was lost. Try again whenever you like.";

/** Move the element at `from` to index `to`, returning a new array. */
function reorder<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Epic S S3b (spec §4.3): the manual re-rank surface on the DRAFT result page.
 *
 * - "Put in order by hand" flips the bucketed composition into a flat
 *   drag-to-reorder list (native HTML5 draggable; ≥44px handles; no swiping).
 * - Per-row move-up / move-down buttons are the AA keyboard/AT path (≥44px,
 *   disabled at the ends, focus stays on the moved control) — no full aria
 *   grabbed/dropped pattern.
 * - Every reorder (drag OR button) recomputes a dense manualRank 0..N-1 and
 *   issues ONE bulk PATCH; the optimistic order reverts wholesale on failure
 *   (single atomic call = clean rollback).
 * - A finalized result shows NO reorder affordance — reorder is a draft
 *   activity — and instead offers "Make a revision" (the supersede flow).
 */
export function RerankPanel({ resultId, collectionId, status, rows, children }: RerankPanelProps) {
  const [mode, setMode] = useState<"view" | "reorder">("view");
  const [order, setOrder] = useState<RerankRow[]>(rows);
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
    // The moved row's same-direction control, unless that end is now disabled (top
    // reached, or the row is momentarily disabled while the PATCH is in flight) —
    // then the opposite control. If BOTH are disabled (busy), keep the intent and
    // retry once `busy` clears, so focus is never dropped onto a disabled button.
    const same = buttonRefs.current.get(`${want.rid}:${want.dir}`);
    const other = buttonRefs.current.get(`${want.rid}:${want.dir === "up" ? "down" : "up"}`);
    const target = same && !same.disabled ? same : other && !other.disabled ? other : null;
    if (target) {
      pendingFocus.current = null;
      target.focus();
    }
  }, [order, busy]);

  const persist = useCallback(
    async (next: RerankRow[], announceMsg: string) => {
      const prev = order;
      setOrder(next);
      setAnnounce(announceMsg);
      setBusy(true);
      try {
        const res = await fetch(`/api/sort-results/${resultId}/items`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order: next.map((r, i) => ({ rid: r.rid, manualRank: i })),
          }),
        });
        if (!res.ok) throw new Error("reorder failed");
      } catch {
        setOrder(prev); // clean rollback — one call, one revert (§4.3)
        setAnnounce(GENTLE_FAIL);
      } finally {
        setBusy(false);
      }
    },
    [order, resultId],
  );

  function moveByButton(index: number, dir: "up" | "down") {
    const to = dir === "up" ? index - 1 : index + 1;
    if (to < 0 || to >= order.length) return;
    const moved = order[index];
    pendingFocus.current = { rid: moved.rid, dir };
    const next = reorder(order, index, to);
    void persist(next, movedAnnouncement(moved.name, to + 1, next.length));
  }

  function handleDrop(index: number) {
    const from = draggingIndex;
    setDraggingIndex(null);
    if (from === null || from === index) return;
    const moved = order[from];
    const next = reorder(order, from, index);
    const newPos = next.findIndex((r) => r.rid === moved.rid);
    void persist(next, movedAnnouncement(moved.name, newPos + 1, next.length));
  }

  async function resetToComputed() {
    const prev = order;
    const computed = [...order].sort((a, b) => a.computedRank - b.computedRank);
    setOrder(computed);
    setAnnounce(BACK_TO_COMPUTED);
    setBusy(true);
    try {
      const res = await fetch(`/api/sort-results/${resultId}/items`, { method: "DELETE" });
      if (!res.ok) throw new Error("reset failed");
    } catch {
      setOrder(prev);
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
    // offer the existing supersede flow instead.
    return (
      <div className="space-y-6">
        <div>
          <RevisionButton resultId={resultId} collectionId={collectionId} />
        </div>
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
            {order.map((row, i) => (
              <li
                key={row.rid}
                draggable={!busy}
                onDragStart={() => setDraggingIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
                onDragEnd={() => setDraggingIndex(null)}
                data-testid="rerank-row"
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
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded bg-content-soft">
                  <CardImage src={row.coverUrl} alt="" fallback={<span aria-hidden />} />
                </div>
                <span className="flex-1 truncate text-ink">{row.name}</span>
                <button
                  type="button"
                  aria-label={moveUpLabel(row.name)}
                  disabled={i === 0 || busy}
                  onClick={() => moveByButton(i, "up")}
                  ref={(el) => {
                    if (el) buttonRefs.current.set(`${row.rid}:up`, el);
                    else buttonRefs.current.delete(`${row.rid}:up`);
                  }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink hover:bg-content-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span aria-hidden>↑</span>
                </button>
                <button
                  type="button"
                  aria-label={moveDownLabel(row.name)}
                  disabled={i === order.length - 1 || busy}
                  onClick={() => moveByButton(i, "down")}
                  ref={(el) => {
                    if (el) buttonRefs.current.set(`${row.rid}:down`, el);
                    else buttonRefs.current.delete(`${row.rid}:down`);
                  }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink hover:bg-content-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span aria-hidden>↓</span>
                </button>
              </li>
            ))}
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
