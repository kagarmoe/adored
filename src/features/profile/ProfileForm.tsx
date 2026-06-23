"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button, Input, ErrorMessage } from "@/components/ui";
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
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div role="alert">{error && <ErrorMessage message={error} />}</div>

      <Input
        label="Display name"
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

      <p className="text-sm text-ink-soft">
        This is the name shown across Adored. You can leave it blank — we&rsquo;ll just use{" "}
        {email}.
      </p>

      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
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
  );
}
