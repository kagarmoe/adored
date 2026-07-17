"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPoolPhotoAssetUrl, PHOTO_WIDTH } from "@/lib/photos";
import type { Photo } from "@/types";
import { PoolActionBar, type MoveDestination, type MoveTarget } from "./PoolActionBar";

type PoolPhoto = Pick<Photo, "id" | "filename">;

// A success notice that offers a link to the thing it just created is an
// offer, not a redirect — it stays up until the person acts on it or moves
// on (toggle/group/each/move/clear), never auto-dismissed. A notice with no
// href is a plain confirmation and keeps the old 4s auto-dismiss. When href
// is set, the WHOLE sentence is the link's accessible name — a repo copy
// rule against several links sharing one bare accessible name (e.g. "take a
// look.") on the same page.
type Notice = { text: string; href?: string };

function alt(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
}

// Reads a failed response's `error` field (the errorResponse contract — see
// src/server/api/http-errors.ts; there is no `message` field) so the UI can
// surface the server's own warm copy instead of a generic fallback. A body
// that isn't JSON, or has no string `error`, falls back quietly.
async function serverErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await res.json();
    const message = (body as { error?: unknown })?.error;
    if (typeof message === "string" && message) return message;
  } catch {
    // non-JSON or empty body — use the fallback below
  }
  return fallback;
}

export function PoolPhotoGrid({
  collectionId,
  photos,
  targets = [],
}: {
  collectionId: string;
  photos: PoolPhoto[];
  targets?: MoveTarget[];
}) {
  const [pool, setPool] = useState<PoolPhoto[]>(photos);
  const [selected, setSelected] = useState<string[]>([]); // selection order: [0] becomes hero
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A link-bearing notice is an offer to follow up, not a toast — it stays
  // until the next selection change or action-bar action clears it (see
  // toggle/clear/groupPool/moveTo below). A plain notice keeps the old
  // quiet auto-dismiss so it never lingers.
  useEffect(() => {
    if (!notice || notice.href) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const toggle = (id: string) => {
    setNotice(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const clear = () => {
    setNotice(null);
    setSelected([]);
  };

  // `mode: "each"` splits the selection into one item per photo; the default
  // groups them all into a single item (whose number the success note surfaces).
  const groupPool = async (mode?: "each") => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/collections/${collectionId}/pool/group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode ? { photoIds: selected, mode } : { photoIds: selected }),
      });
      const fallback =
        mode === "each"
          ? "We couldn’t make those items just now — your photos are safe; try again."
          : "We couldn’t make that item just now — your photos are safe; try again.";
      if (!res.ok) {
        setError(await serverErrorMessage(res, fallback));
        return;
      }
      const grouped = new Set(selected);
      setPool((prev) => prev.filter((p) => !grouped.has(p.id)));
      setSelected([]);
      if (mode === "each") {
        const data = (await res.json()) as { count: number };
        setNotice({
          text: `${data.count} items are ready — see them all.`,
          href: `/collections/${collectionId}/items`,
        });
      } else {
        const data = (await res.json()) as { number: number };
        setNotice({
          text: `Item #${data.number} is ready — take a look.`,
          href: `/collections/${collectionId}/items/${data.number}`,
        });
      }
    } catch {
      setError(
        mode === "each"
          ? "We couldn’t make those items just now — your photos are safe; try again."
          : "We couldn’t make that item just now — your photos are safe; try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const makeItem = () => groupPool();
  const makeEach = () => groupPool("each");

  const moveTo = async (dest: MoveDestination) => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/collections/${collectionId}/photos/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: selected, destination: dest }),
      });
      if (!res.ok) {
        setError(await serverErrorMessage(res, "We couldn’t move those just now — your photos are safe; try again."));
        return;
      }
      const data = (await res.json()) as { number: number | null };
      const moved = new Set(selected);
      setPool((prev) => prev.filter((p) => !moved.has(p.id)));
      setSelected([]);
      const base = dest.type === "new" ? "Now their own item" : "Moved";
      const href = data.number != null ? `/collections/${collectionId}/items/${data.number}` : undefined;
      setNotice({ text: href ? `${base} — take a look.` : `${base}.`, href });
    } catch {
      setError("We couldn’t move those just now — your photos are safe; try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {notice && (
        <p className="rounded-lg bg-success-soft px-4 py-2 text-success-deep" role="status">
          {notice.href ? (
            <Link href={notice.href} className="font-medium underline">
              {notice.text}
            </Link>
          ) : (
            notice.text
          )}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-error-soft px-4 py-2 text-error-deep" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
        {pool.map((p) => {
          const isSelected = selected.includes(p.id);
          const isCover = selected[0] === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggle(p.id)}
              className={`relative aspect-square min-h-11 overflow-hidden rounded-lg border-2 bg-surface-raised outline-hidden transition focus-visible:ring-2 focus-visible:ring-primary ${
                isSelected ? "border-primary" : "border-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getPoolPhotoAssetUrl(collectionId, p.id, { w: PHOTO_WIDTH.poolTile })}
                alt={alt(p.filename)}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {isSelected && isCover && (
                // Unlike the plain ✓, "Cover" carries information aria-pressed
                // doesn't (WHICH photo becomes the item's hero) — not aria-hidden.
                <span className="absolute left-1.5 top-1.5 rounded-full bg-spark px-2 py-0.5 text-xs font-medium text-spark-ink shadow-sm">
                  Cover
                </span>
              )}
              {isSelected && !isCover && (
                <span
                  aria-hidden
                  className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-sm text-primary-ink shadow-sm"
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected.length > 0 && <div aria-hidden className="h-20" />}

      <PoolActionBar
        count={selected.length}
        busy={busy}
        targets={targets}
        onMakeItem={makeItem}
        onMakeEach={makeEach}
        onMove={moveTo}
        onClear={clear}
      />
    </div>
  );
}
