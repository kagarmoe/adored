"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { Button, Card, Input, ErrorMessage } from "@/components/ui";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { apiPatch } from "@/lib/api-client";
import { TUTORIALS } from "@/features/tutorials/tutorials";

interface ProfileFormProps {
  initialName: string | null;
  email: string;
}

export function ProfileForm({ initialName, email }: ProfileFormProps) {
  const { refetch } = useSession();
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
      // Re-pull the session so the Header's display name updates immediately.
      // The façade reads the name fresh from the DB per request (no cookie
      // cache), so refetch reflects the save with no stale claim to clear.
      await refetch();
    } catch {
      // Soft failure: the name is saved; only the live session lags until the
      // next natural refresh. Do not flip the UI to an error.
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card padding="lg" className="p-6!">
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

          <Button type="submit" disabled={saving} className="w-full sm:w-auto">
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

      <div className="flex flex-col items-start gap-3 rounded-control border border-rim bg-glass px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-ink">Theme</p>
          <p className="text-sm text-ink-soft">Switch between light and dark.</p>
        </div>
        <ThemeToggle />
      </div>

      <section
        aria-labelledby="profile-tutorials-heading"
        className="rounded-control border border-rim bg-glass px-4 py-3"
      >
        <div>
          <h2 id="profile-tutorials-heading" className="text-sm font-medium text-ink">
            Tutorials
          </h2>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          Revisit any part of Adored when you want a quick refresher.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TUTORIALS.map((tutorial) => (
            <Link
              key={tutorial.slug}
              href={tutorial.href}
              className="inline-flex h-11 items-center rounded-control px-3 text-sm text-primary underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
            >
              {tutorial.title}
            </Link>
          ))}
        </div>
      </section>

      <DeleteAccountSection email={email} />
    </div>
  );
}
