"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button, Card, Input, ErrorMessage } from "@/components/ui";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { apiPatch } from "@/lib/api-client";

interface ProfileFormProps {
  initialName: string | null;
  email: string;
}

export function ProfileForm({ initialName, email }: ProfileFormProps) {
  const { update } = useSession();
  const [name, setName] = useState(initialName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);

    const trimmed = name.trim();

    let confirmedName: string | null = trimmed === "" ? null : trimmed;
    try {
      const saved = await apiPatch("/api/users/me", { name: trimmed });
      // Prefer the server-confirmed value so the session refresh matches the DB.
      if (saved && typeof saved === "object" && "name" in saved) {
        confirmedName = (saved as { name: string | null }).name;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not save your name just now.");
      setSaving(false);
      return;
    }

    // The save persisted. Reflect it immediately — a session-refresh hiccup
    // below must NOT report the successful save as failed.
    setName(confirmedName ?? "");
    setSaved(true);
    setSaving(false);

    try {
      await update({ name: confirmedName });
    } catch {
      // Soft failure: the name is saved; only the live session lags until the
      // next natural refresh. Do not flip the UI to an error.
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card padding="lg" className="!p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <ErrorMessage message={error} />}

          <Input
            label="Name"
            type="text"
            autoComplete="name"
            placeholder="The name you go by"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            disabled={saving}
          />

          <Input label="Email" type="email" value={email} disabled readOnly />

          <p className="text-sm text-ink-soft">
            Your name is shown across Adored. You can leave it blank — we&rsquo;ll just use your email.
          </p>

          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>

          {saved && (
            <p
              role="status"
              aria-live="polite"
              className="bg-success-soft text-success-deep rounded-control px-3 py-2 text-sm"
            >
              Saved — your name is set.
            </p>
          )}
        </form>
      </Card>

      <div className="flex items-center justify-between gap-4 rounded-control border border-hairline bg-surface px-4 py-3">
        <div>
          <p className="text-sm font-medium text-ink">Theme</p>
          <p className="text-sm text-ink-soft">Switch between light and dark.</p>
        </div>
        <ThemeToggle />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-control border border-hairline bg-surface px-4 py-3">
        <div>
          <p className="text-sm font-medium text-ink">New to Adored?</p>
          <p className="text-sm text-ink-soft">Revisit the quick walkthrough anytime.</p>
        </div>
        {/* Re-open the walkthrough (manual visit — does NOT clear the dismissal flag). */}
        <Link
          href="/welcome"
          className="inline-flex h-11 items-center rounded-control px-4 text-sm text-primary underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
        >
          How Adored works
        </Link>
      </div>

      <DeleteAccountSection email={email} />
    </div>
  );
}
