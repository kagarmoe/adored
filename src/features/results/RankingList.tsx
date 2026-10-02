"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CardImage } from "@/components/ui";
import type { UsageAnswer } from "@/lib/derive-usage";
import { usageChipLabel } from "@/features/items/usage-chip-copy";

export interface RankingRow {
  itemId: string;
  href: string;
  name: string;
  coverUrl?: string;
  initial: string;
  tier: "Love" | "Like" | "Maybe";
  pinned: boolean;
  usage?: UsageAnswer;
}

const GENTLE_FAIL = "That didn't hold just now — nothing was lost. Try again whenever you like.";
const control =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink hover:bg-content-soft focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40";

type Direction = "up" | "down";

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * The live ranking's ordered list (spec §4 "Adjusting"). Drag or the up/down
 * buttons move ONE piece and pin it there; later pair answers flow around it.
 * Unpin hands it back to the derived order. Each change is one small request;
 * a failure puts the list back as it was.
 */
export function RankingList({ collectionId, rows }: { collectionId: string; rows: RankingRow[] }) {
  const router = useRouter();
  const [order, setOrder] = useState(rows);
  // A refresh brings the server's order: take it.
  const [seen, setSeen] = useState(rows);
  if (rows !== seen) {
    setSeen(rows);
    setOrder(rows);
  }
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  // Shown on screen as well as spoken: a list that silently snaps back reads as a glitch.
  const [notice, setNotice] = useState("");
  // The move buttons stay enabled while a request is out (disabling the focused
  // button drops focus to <body>); this ref is the double-tap guard instead.
  const inFlight = useRef(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<{ itemId: string; dir: Direction } | null>(null);

  // Reordering moves <li> nodes, which drops focus; put it back on the same
  // piece's button (or its other one, once it has reached an end).
  useEffect(() => {
    const target = refocus.current;
    if (!target) return;
    refocus.current = null;
    const other: Direction = target.dir === "up" ? "down" : "up";
    [target.dir, other]
      .map((dir) => buttons.current.get(`${target.itemId}:${dir}`))
      .find((button) => button && !button.disabled)
      ?.focus();
  }, [order]);

  async function place(from: number, to: number, focusDir?: Direction) {
    if (inFlight.current || from === to || to < 0 || to >= order.length) return;
    inFlight.current = true;
    const previous = order;
    const next = move(order, from, to).map((r, i) => (i === to ? { ...r, pinned: true } : r));
    if (focusDir) refocus.current = { itemId: next[to].itemId, dir: focusDir };
    setOrder(next);
    setBusy(true);
    setNotice("");
    setAnnounce(`Moved ${next[to].name} to position ${to + 1} of ${next.length}.`);
    try {
      const res = await fetch(`/api/collections/${collectionId}/ranking/pins/${next[to].itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: to + 1 }),
      });
      if (!res.ok) throw new Error("pin");
      router.refresh();
    } catch {
      if (focusDir) refocus.current = { itemId: next[to].itemId, dir: focusDir };
      setOrder(previous);
      setAnnounce("");
      setNotice(GENTLE_FAIL);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function unpin(row: RankingRow) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch(`/api/collections/${collectionId}/ranking/pins/${row.itemId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("unpin");
      setAnnounce(`${row.name} is back in its suggested place.`);
      router.refresh();
    } catch {
      setNotice(GENTLE_FAIL);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function track(key: string, el: HTMLButtonElement | null) {
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  }

  return (
    <section aria-labelledby="ranking-order-heading" className="space-y-3">
      <h2 id="ranking-order-heading" className="font-display text-2xl text-ink">
        Your order
      </h2>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      {notice && (
        <p role="status" className="text-sm text-ink-soft">
          {notice}
        </p>
      )}
      <ol className="space-y-2">
        {order.map((row, i) => (
          <li
            key={row.itemId}
            draggable={!busy}
            onDragStart={() => setDragging(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const from = dragging;
              setDragging(null);
              if (from !== null) void place(from, i);
            }}
            onDragEnd={() => setDragging(null)}
            className={`flex items-center gap-3 rounded-card border border-hairline bg-surface p-2${dragging === i ? " opacity-60" : ""}`}
          >
            <span aria-hidden className="flex h-11 w-6 shrink-0 cursor-grab items-center justify-center text-lg text-ink-soft">
              ⠿
            </span>
            <span className="w-6 shrink-0 text-center text-sm text-ink-soft">{i + 1}</span>
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-control bg-content-soft">
              <CardImage
                src={row.coverUrl}
                alt=""
                fallback={
                  <span aria-hidden className="font-display text-lg text-ink-soft">
                    {row.initial}
                  </span>
                }
              />
            </span>
            <span className="min-w-0 flex-1">
              <Link href={row.href} className="block truncate text-ink underline-offset-2 hover:underline">
                {row.name}
              </Link>
              <span className="block text-xs text-ink-soft">
                {row.tier}
                {row.usage ? ` · ${usageChipLabel(row.usage)}` : ""}
              </span>
            </span>
            {row.pinned && (
              <button
                type="button"
                onClick={() => void unpin(row)}
                disabled={busy}
                aria-label={`Unpin ${row.name}`}
                className="h-11 shrink-0 rounded-pill px-3 text-sm text-ink-soft hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Unpin
              </button>
            )}
            <button
              type="button"
              ref={(el) => track(`${row.itemId}:up`, el)}
              aria-label={`Move ${row.name} up`}
              disabled={i === 0}
              onClick={() => void place(i, i - 1, "up")}
              className={control}
            >
              <span aria-hidden>↑</span>
            </button>
            <button
              type="button"
              ref={(el) => track(`${row.itemId}:down`, el)}
              aria-label={`Move ${row.name} down`}
              disabled={i === order.length - 1}
              onClick={() => void place(i, i + 1, "down")}
              className={control}
            >
              <span aria-hidden>↓</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
