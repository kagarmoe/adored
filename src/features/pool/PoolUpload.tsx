"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Button, Card } from "@/components/ui";
import { convertHeifToJpeg } from "@/lib/heic";
import { isHeifFile, partitionPoolFiles } from "@/lib/uploads";
import { MAX_GROUP_PHOTOS } from "@/lib/pool-limits";

interface PoolUploadProps {
  collectionId: string;
  /** Item mode (the item page's "+ Add photos"): finished uploads move onto this item. */
  attachToItemId?: string;
}

type FileStatus = "pending" | "preparing" | "uploading" | "done" | "error" | "skipped";

interface TrackedFile {
  key: string;
  name: string;
  status: FileStatus;
  error?: string;
}

// The screen-reader announcement for a batch (purses-orsx). ONE coarse sentence,
// rewritten in place — never the per-file list. `role="status"` is implicitly
// aria-atomic, so the region is re-read IN FULL on every change: a live region
// wrapped around the N-row list would re-announce all N filenames on all ~3N
// status transitions. The visible list keeps the per-file detail (and its list
// semantics) for browsing; this says only what changed at the batch level.
function uploadSummary(files: TrackedFile[]): string {
  if (files.length === 0) return "";
  const photos = (n: number) => `${n} ${n === 1 ? "photo" : "photos"}`;

  const settled = (f: TrackedFile) =>
    f.status === "done" || f.status === "error" || f.status === "skipped";
  if (!files.every(settled)) return `Adding ${photos(files.length)}…`;

  const added = files.filter((f) => f.status === "done").length;
  const missed = files.length - added;
  const parts: string[] = [];
  if (added > 0) parts.push(`${photos(added)} added`);
  if (missed > 0) parts.push(`${photos(missed)} couldn't be added`);
  return `${parts.join(", ")}.`;
}

const POLL_INTERVAL_MS = 1200;
const POLL_TIMEOUT_MS = 15000;
const FALLBACK_DELAY_MS = 2500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPoolCount(collectionId: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/collections/${collectionId}/pool/photos`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { photos?: unknown[] };
    return Array.isArray(data.photos) ? data.photos.length : null;
  } catch {
    return null;
  }
}

// Pooled rows are written by Blob's async completion callback, which lands a
// beat after upload() resolves — so refreshing immediately can show an empty
// pool. Wait until the server reflects the new rows (or a timeout) before
// refreshing, so the grid never looks empty right after a successful add.
async function waitForPooledRows(
  collectionId: string,
  baseline: number | null,
  expectedNew: number,
): Promise<void> {
  if (baseline === null) {
    // Couldn't read a baseline; give the callback a moment, then refresh anyway.
    await delay(FALLBACK_DELAY_MS);
    return;
  }
  const target = baseline + expectedNew;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);
    const current = await fetchPoolCount(collectionId);
    if (current !== null && current >= target) return;
  }
}

// Item mode: uploads go through the pool exactly as usual, then the rows we just
// created — matched by blob pathname, which the Blob callback stores as `filename` —
// move onto the item via the existing reassign route. Returns how many moved; any
// that didn't simply stay in the pool.
export async function attachToItem(
  collectionId: string,
  itemId: string,
  pathnames: string[],
): Promise<number> {
  let moved = 0;
  try {
    const res = await fetch(`/api/collections/${collectionId}/pool/photos`, { cache: "no-store" });
    if (!res.ok) return 0;
    const { photos = [] } = (await res.json()) as { photos?: { id: string; filename: string }[] };
    const wanted = new Set(pathnames);
    const ids = photos.filter((p) => wanted.has(p.filename)).map((p) => p.id);
    for (let i = 0; i < ids.length; i += MAX_GROUP_PHOTOS) {
      const photoIds = ids.slice(i, i + MAX_GROUP_PHOTOS);
      const r = await fetch(`/api/collections/${collectionId}/photos/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds, destination: { type: "item", itemId } }),
      });
      if (r.ok) moved += photoIds.length;
    }
  } catch (err) {
    console.error("attach to item failed", err);
  }
  return moved;
}

export function PoolUpload({ collectionId, attachToItemId }: PoolUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<TrackedFile[]>([]);
  const [note, setNote] = useState("");

  const update = (key: string, patch: Partial<TrackedFile>) =>
    setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const uploadAll = async (selected: File[]) => {
    const { accepted, skipped } = partitionPoolFiles(selected);
    // surface skipped files gently (so the person sees why nothing happened for
    // them) — a pre-flight skip is not a failure, so it renders muted, not red.
    if (skipped.length > 0) {
      setFiles((prev) => [
        ...skipped.map((s) => ({
          key: `skip-${s.name}-${s.reason}`,
          name: s.name,
          status: "skipped" as const,
          error: s.reason,
        })),
        ...prev,
      ]);
    }
    if (accepted.length === 0) return;

    setBusy(true);
    // Baseline before any rows are written, so we can detect when the async
    // completion callbacks have caught up.
    const baseline = await fetchPoolCount(collectionId);
    const tracked: TrackedFile[] = accepted.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      status: "pending",
    }));
    setFiles((prev) => [...tracked, ...prev]);

    let succeeded = 0;
    const uploaded: string[] = [];
    // Sequential keeps the UI legible and avoids hammering the token endpoint;
    // switch to a small concurrency pool later if needed.
    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i];
      const t = tracked[i];
      try {
        update(t.key, { status: "preparing" });
        const toUpload = isHeifFile(file) ? await convertHeifToJpeg(file) : file;
        update(t.key, { status: "uploading" });
        const blob = await upload(toUpload.name, toUpload, {
          access: "private",
          handleUploadUrl: `/api/collections/${collectionId}/pool/upload`,
          contentType: toUpload.type,
        });
        update(t.key, { status: "done" });
        succeeded += 1;
        uploaded.push(blob.pathname);
      } catch (err) {
        // The thrown message is machine-register ("Vercel Blob: Failed to retrieve the
        // client token") and is now SPOKEN, not just shown — keep the raw text for the
        // console and give the person a sentence from their side (TONE).
        console.error("pool upload failed", err);
        update(t.key, { status: "error", error: "This one didn't make it — you can try again." });
      }
    }

    if (succeeded > 0) {
      // Wait for Blob's async completion callbacks to persist the rows, then
      // refresh so the pool grid reflects what was just added.
      await waitForPooledRows(collectionId, baseline, succeeded);
      if (attachToItemId) {
        const moved = await attachToItem(collectionId, attachToItemId, uploaded);
        setNote(moved < succeeded ? "A few photos are still arriving — they’ll wait in your photo pool." : "");
      }
      router.refresh();
    }
    setBusy(false);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    if (inputRef.current) inputRef.current.value = "";
    await uploadAll(list);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const list = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    await uploadAll(list);
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragging(false);
          }
        }}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-primary bg-primary-soft" : "border-hairline"
        }`}
      >
        <span className="text-4xl">📸</span>
        <p className="mt-2 text-ink">Drop photos here, or</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          onChange={onPick}
          className="hidden"
        />
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Adding photos…" : "Select photos"}
        </Button>
        {!attachToItemId && (
          <p className="mt-2 text-sm text-ink-soft">
            Add as many as you like — you can name and group them later.
          </p>
        )}
      </div>
      {note && <p className="text-sm text-ink-soft">{note}</p>}

      {/* Mounted for the component's whole life, NOT gated on files.length (purses-orsx):
          a live region must already exist when its text changes, or AT never observes the
          mutation. Born-with-content regions are the classic silent-live-region bug — and
          the drop-only-unsupported-files path never mutates again after mount. */}
      <p role="status" className="sr-only">
        {uploadSummary(files)}
      </p>

      {files.length > 0 && (
        <Card padding="md">
          <ul className="space-y-1 text-sm">
            {files.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-2">
                <span className="truncate text-ink-soft">{f.name}</span>
                <span
                  className={
                    f.status === "error"
                      ? "text-error-deep"
                      : f.status === "done"
                        ? "text-success-deep"
                        : "text-ink-soft"
                  }
                >
                  {f.status === "done"
                    ? "added"
                    : f.status === "error"
                      ? (f.error ?? "failed")
                      : f.status === "skipped"
                        ? (f.error ?? "skipped")
                        : f.status === "uploading"
                          ? "uploading…"
                          : f.status === "preparing"
                            ? "preparing…"
                            : "waiting…"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
