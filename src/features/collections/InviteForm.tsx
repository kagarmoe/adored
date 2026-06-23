"use client";

import { useState } from "react";
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const validated = inviteSchema.parse({ email });
      await apiPost(`/api/collections/${collectionId}/invitations`, validated);
      setSuccess(true);
      setEmail("");
      setTimeout(() => setSuccess(false), 3000);
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

  if (success) {
    return (
      <div className="bg-success-soft border border-success-soft rounded-lg px-4 py-3 text-success-deep">
        Invitation sent successfully!
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && <ErrorMessage message={error} />}

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
