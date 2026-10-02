"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import { quietLink } from "@/lib/design/quiet-link";
import { newClientKey } from "@/features/sorting/decisionQueue";

interface SaveAndShareProps {
  /** ULID collection.id (the API never takes the slug). */
  collectionId: string;
  collectionSlug: string;
  /** "<collection name>, <date>" — computed on the server so it never mismatches on hydrate. */
  defaultName: string;
}

const STUMBLE = "That didn't save just now — nothing was lost. Try again whenever you like.";
// 409: this save's link was turned off since. Retrying the same key can never succeed.
const LINK_GONE = "The link from that save is no longer active — save again for a fresh one.";

/**
 * Spec §4.4: one quiet button → name it → one server transaction that saves and
 * returns the share link. The key is minted once per mount and reused on retry,
 * so a double tap or a retried request returns the same link, never a second save
 * (a 409 means that key's link is gone, so only then is a fresh key minted).
 */
export function SaveAndShare({ collectionId, collectionSlug, defaultName }: SaveAndShareProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [saveKey, setSaveKey] = useState(newClientKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ url: string; resultNumber: number } | null>(null);
  const [copied, setCopied] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || name.trim() === "") return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/collections/${collectionId}/ranking/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), saveKey }),
      });
      if (res.status === 409) {
        setSaveKey(newClientKey());
        setError(LINK_GONE);
        return;
      }
      if (!res.ok) throw new Error("save");
      const body = (await res.json()) as { resultNumber: number; shareToken: string };
      setSaved({ url: `${window.location.origin}/shared-results/${body.shareToken}`, resultNumber: body.resultNumber });
    } catch {
      setError(STUMBLE);
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false); // the field stays selectable; copying by hand still works
    }
  }

  if (saved) {
    return (
      <section aria-labelledby="saved-heading" className="w-full space-y-3 rounded-card border border-hairline bg-surface p-4 sm:w-96">
        <h2 id="saved-heading" className="font-display text-xl text-ink">
          Saved
        </h2>
        <Input label="Link to share" readOnly value={saved.url} onFocus={(e) => e.currentTarget.select()} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={() => void copy(saved.url)}>
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Link href={`/collections/${collectionSlug}/results/${saved.resultNumber}`} className={quietLink}>
            See it saved
          </Link>
        </div>
      </section>
    );
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Save and share
      </Button>
    );
  }

  return (
    <form onSubmit={save} className="w-full space-y-3 rounded-card border border-hairline bg-surface p-4 sm:w-96">
      <Input label="Name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy || name.trim() === ""}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Not now
        </Button>
      </div>
      {error && (
        <p role="status" className="text-sm text-ink-soft">
          {error}
        </p>
      )}
    </form>
  );
}
