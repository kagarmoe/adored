"use client";

import { useEffect, useState } from "react";
import { Button, Input, ErrorMessage } from "@/components/ui";
import { apiPost } from "@/lib/api-client";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
});

interface InviteFormProps {
  collectionId: string;
  onSuccess?: () => void;
}

export function InviteForm({ collectionId, onSuccess }: InviteFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState("");

  // Auto-reset the success view after 3s, cleaning the timer up on unmount so we
  // never call setSuccess on an unmounted component (purses-th14).
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(false), 3000);
    return () => clearTimeout(t);
  }, [success]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const validated = inviteSchema.parse({ email });
      await apiPost(`/api/collections/${collectionId}/invitations`, validated);
      setSuccess(true);
      setEmail("");
      onSuccess?.();
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError(err?.message || "Failed to send invitation");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && <ErrorMessage message={error} />}

      {/* Persistent live region: pre-existing in the DOM so the text change on
          success is announced reliably (a region mounted together with its text
          is frequently skipped by screen readers). */}
      <div role="status" aria-live="polite">
        {success && (
          <div className="bg-success-soft border border-success-soft rounded-control px-4 py-3 text-success-deep">
            Invitation sent successfully!
          </div>
        )}
      </div>

      <Input
        label="Email address"
        type="email"
        required
        placeholder="curator@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading}
      />

      <Button type="submit" disabled={loading}>
        {loading ? "Sending..." : "Send Invitation"}
      </Button>
    </form>
  );
}
