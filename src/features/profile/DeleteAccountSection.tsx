"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Button, Card, Input } from "@/components/ui";

interface DeleteAccountSectionProps {
  email: string;
}

// Self-scoped permanent account delete. DELETE /api/users/me takes no body and
// acts on session.user.id (no IDOR). Owned collections are total-erase — they're
// deleted for every co-curator too, so the confirm copy must say so. Strong guard:
// the user retypes their own email (shown on this screen) before the final button
// enables. On success the JWT session is dead, so we signOut() rather than push.
export function DeleteAccountSection({ email }: DeleteAccountSectionProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  // When the confirm step appears, move focus into the email field so a keyboard
  // user isn't dropped and a screen reader announces the new step.
  useEffect(() => {
    if (confirming) inputRef.current?.focus();
  }, [confirming]);

  async function deleteAccount() {
    if (inFlight.current || !matches) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/users/me", { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      // The account is gone — end the (now-dead) session and land on login.
      await signOut();
      router.push("/login");
    } catch {
      setError("That didn’t go through — your account is safe; try again in a moment.");
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <Card padding="lg" className="mt-10 border border-error-soft bg-error-soft/30">
      <h2 className="text-lg text-ink">Delete your account</h2>
      <p className="mt-1 text-sm text-ink-soft">
        This permanently removes your account and everything in it — your collections, items, photos,
        and sorts. Collections you own are deleted for everyone you’ve shared them with. It can’t be
        undone.
      </p>

      {!confirming ? (
        <Button variant="danger" className="mt-4" onClick={() => setConfirming(true)}>
          Delete your account
        </Button>
      ) : (
        <div role="group" aria-label="Delete your account" className="mt-4 flex flex-col gap-3">
          <label htmlFor="confirm-delete-account" className="text-sm text-ink">
            Type <span className="font-semibold">{email}</span> to confirm
          </label>
          <Input
            id="confirm-delete-account"
            ref={inputRef}
            type="email"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            aria-label={`Type ${email} to confirm`}
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setConfirming(false);
                setTyped("");
                setError("");
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteAccount} disabled={busy || !matches}>
              {busy ? "Deleting…" : "Delete account"}
            </Button>
          </div>
          {error && (
            <span role="status" className="text-sm text-error-deep">
              {error}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
