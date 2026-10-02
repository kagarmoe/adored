"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { quietLink } from "@/lib/design/quiet-link";
import { listPendingKeysForCurator, newClientKey } from "@/features/sorting/decisionQueue";
import { drain } from "@/features/sorting/decisionFlusher";

interface SaveAndShareProps {
  /** ULID collection.id (the API never takes the slug). */
  collectionId: string;
  collectionSlug: string;
  curatorId: string;
  /** "<collection name>, <date>" — computed on the server so it never mismatches on hydrate. */
  defaultName: string;
}

const STUMBLE = "That didn't save just now — nothing was lost. Try again whenever you like.";
// 409 save_key_conflict: this save's link was turned off since. Retrying the same key can never succeed.
const LINK_GONE = "The link from that save is no longer active — save again for a fresh one.";
// 409 nothing_to_save: nothing is ranked yet; the key was never used, so it stays.
const NOTHING_YET = "Nothing to save yet — sort a few first, then come back.";

/**
 * Spec §4.4: one quiet button → name it → one server transaction that saves and
 * returns the share link. The key is minted once per mount and reused on retry,
 * so a double tap or a retried request returns the same link, never a second save
 * (only a 409 save_key_conflict — that key's link is gone — mints a fresh key).
 * Answers still queued on this device land first, so the save includes them.
 */
export function SaveAndShare({ collectionId, collectionSlug, curatorId, defaultName }: SaveAndShareProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [saveKey, setSaveKey] = useState(newClientKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ url: string; resultNumber: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const savedHeading = useRef<HTMLHeadingElement>(null);
  // Each step replaces the last one's controls; move focus with it (SC 2.4.3).
  const [returnFocus, setReturnFocus] = useState(false);
  useEffect(() => {
    if (saved) savedHeading.current?.focus();
  }, [saved]);
  useEffect(() => {
    if (returnFocus && !open) opener.current?.focus();
  }, [returnFocus, open]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || name.trim() === "") return;
    setBusy(true);
    setError("");
    try {
      await drain(listPendingKeysForCurator(curatorId));
      const res = await fetch(`/api/collections/${collectionId}/ranking/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), saveKey }),
      });
      if (res.status === 409) {
        const { code } = (await res.json().catch(() => ({}))) as { code?: string };
        if (code === "nothing_to_save") {
          setError(NOTHING_YET);
          return;
        }
        setSaveKey(newClientKey());
        setError(LINK_GONE);
        return;
      }
      if (!res.ok) throw new Error("save");
      const body = (await res.json()) as { resultNumber: number; shareToken: string };
      setSaved({ url: `${window.location.origin}/shared-results/${body.shareToken}`, resultNumber: body.resultNumber });
      // The save carried the pins into a fresh draft; let the Ranking read it again.
      router.refresh();
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
        <h2 id="saved-heading" ref={savedHeading} tabIndex={-1} className="font-display text-xl text-ink focus:outline-hidden">
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
      <Button ref={opener} type="button" onClick={() => setOpen(true)}>
        Save and share
      </Button>
    );
  }

  return (
    <form onSubmit={save} className="w-full space-y-3 rounded-card border border-hairline bg-surface p-4 sm:w-96">
      {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the person just asked to name it */}
      <Input label="Name" autoFocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      <div className="flex flex-wrap gap-3">
        {/* aria-disabled while saving, not disabled: disabling the focused button drops focus to <body>. */}
        <Button type="submit" disabled={name.trim() === ""} aria-disabled={busy || undefined}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setReturnFocus(true);
          }}
        >
          Not now
        </Button>
      </div>
      {/* Always mounted (empty when idle) so the text is announced when it lands. */}
      <p role="status" className="text-sm text-ink-soft">
        {error}
      </p>
    </form>
  );
}
