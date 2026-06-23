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

    try {
      await apiPatch("/api/users/me", { name: trimmed });
      await update({ name: trimmed });
      setName(trimmed);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not save your name just now.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && <ErrorMessage message={error} />}

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
        <p role="status" aria-live="polite" className="text-sm text-success-deep">
          Saved — your name is set.
        </p>
      )}
    </form>
  );
}
