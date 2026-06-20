"use client";

import { useEffect, useState } from "react";
import { getPoolPhotoAssetUrl, PHOTO_WIDTH } from "@/lib/photos";
import type { Photo } from "@/types";
import { PoolActionBar } from "./PoolActionBar";

type PoolPhoto = Pick<Photo, "id" | "filename">;

function alt(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
}

export function PoolPhotoGrid({
  collectionId,
  photos,
}: {
  collectionId: string;
  photos: PoolPhoto[];
}) {
  const [pool, setPool] = useState<PoolPhoto[]>(photos);
  const [selected, setSelected] = useState<string[]>([]); // selection order: [0] becomes hero
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The success confirmation is a quiet, auto-dismissing note (design spec) —
  // it clears itself so it never lingers as the person keeps grouping.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const clear = () => setSelected([]);

  const makeItem = async () => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/collections/${collectionId}/pool/group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: selected }),
      });
      if (!res.ok) {
        throw new Error("group failed");
      }
      const data = (await res.json()) as { number: number };
      const grouped = new Set(selected);
      setPool((prev) => prev.filter((p) => !grouped.has(p.id)));
      setSelected([]);
      setNotice(`Your photos are grouped — find item #${data.number} in your items.`);
    } catch {
      setError("We couldn’t make that item just now — your photos are safe; try again.");
    } finally {
      setBusy(false);
    }
  };

  const makeEach = async () => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/collections/${collectionId}/pool/group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: selected, mode: "each" }),
      });
      if (!res.ok) {
        throw new Error("group failed");
      }
      await res.json();
      const grouped = new Set(selected);
      setPool((prev) => prev.filter((p) => !grouped.has(p.id)));
      setSelected([]);
      setNotice("Your photos are now their own items — find them in your items.");
    } catch {
      setError("We couldn’t make those items just now — your photos are safe; try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {notice && (
        <p className="rounded-lg bg-success-soft px-4 py-2 text-success-deep" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-error-soft px-4 py-2 text-error-deep" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {pool.map((p) => {
          const isSelected = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggle(p.id)}
              className={`relative aspect-square min-h-11 overflow-hidden rounded-lg bg-surface-raised outline-none transition focus-visible:ring-2 focus-visible:ring-primary ${
                isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-surface" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getPoolPhotoAssetUrl(collectionId, p.id, { w: PHOTO_WIDTH.poolTile })}
                alt={alt(p.filename)}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {isSelected && (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-sm text-primary-ink shadow"
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
        onMakeItem={makeItem}
        onMakeEach={makeEach}
        onClear={clear}
      />
    </div>
  );
}
