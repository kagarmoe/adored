"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Button, Card } from "@/components/ui";
import { convertHeifToJpeg } from "@/lib/heic";
import { isHeifFile, partitionPoolFiles } from "@/lib/uploads";

interface PoolUploadProps {
  collectionId: string;
}

type FileStatus = "pending" | "preparing" | "uploading" | "done" | "error" | "skipped";

interface TrackedFile {
  key: string;
  name: string;
  status: FileStatus;
  error?: string;
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

export function PoolUpload({ collectionId }: PoolUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<TrackedFile[]>([]);

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
    // Sequential keeps the UI legible and avoids hammering the token endpoint;
    // switch to a small concurrency pool later if needed.
    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i];
      const t = tracked[i];
      try {
        update(t.key, { status: "preparing" });
        const toUpload = isHeifFile(file) ? await convertHeifToJpeg(file) : file;
        update(t.key, { status: "uploading" });
        await upload(toUpload.name, toUpload, {
          access: "private",
          handleUploadUrl: `/api/collections/${collectionId}/pool/upload`,
          contentType: toUpload.type,
        });
        update(t.key, { status: "done" });
        succeeded += 1;
      } catch (err) {
        update(t.key, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }

    if (succeeded > 0) {
      // Wait for Blob's async completion callbacks to persist the rows, then
      // refresh so the pool grid reflects what was just added.
      await waitForPooledRows(collectionId, baseline, succeeded);
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
        <p className="mt-2 text-sm text-ink-soft">
          Add as many as you like — you can name and group them later.
        </p>
      </div>

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
