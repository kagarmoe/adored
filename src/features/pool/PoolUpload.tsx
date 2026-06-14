"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Button, Card } from "@/components/ui";
import { convertHeifToJpeg } from "@/lib/heic";
import { isHeifFile } from "@/lib/uploads";

interface PoolUploadProps {
  collectionId: string;
}

type FileStatus = "pending" | "preparing" | "uploading" | "done" | "error";

interface TrackedFile {
  key: string;
  name: string;
  status: FileStatus;
  error?: string;
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
    const images = selected.filter((f) => f.type.startsWith("image/") || isHeifFile(f));
    if (images.length === 0) return;

    setBusy(true);
    const tracked: TrackedFile[] = images.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      status: "pending",
    }));
    setFiles((prev) => [...tracked, ...prev]);

    let anySucceeded = false;
    // Sequential keeps the UI legible and avoids hammering the token endpoint;
    // switch to a small concurrency pool later if needed.
    for (let i = 0; i < images.length; i++) {
      const file = images[i];
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
        anySucceeded = true;
      } catch (err) {
        update(t.key, {
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }

    setBusy(false);
    if (anySucceeded) {
      // Pooled rows are written by Blob's completion callback; refresh to show them.
      router.refresh();
    }
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
