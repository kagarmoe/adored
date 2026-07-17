"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [emailNotSent, setEmailNotSent] = useState(false);
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
    setSuccess(false);
    setEmailNotSent(false);
    setLoading(true);

    try {
      const validated = inviteSchema.parse({ email });
      const result = await apiPost<{ emailSent?: boolean }>(
        `/api/collections/${collectionId}/invitations`,
        validated,
      );
      setSuccess(true);
      setEmailNotSent(result.emailSent === false);
      setEmail("");
      // The members page is a server component; refresh so the new pending
      // row (with its Copy link button) appears while this notice is visible.
      router.refresh();
      onSuccess?.();
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        setError(err.issues[0].message);
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
          is frequently skipped by screen readers). Both the success message and
          the (rarer) email-not-sent notice share this one region.
          `emailNotSent` is intentionally NOT gated on `success` here: the plain
          success message auto-resets after 3s, but the email-not-sent notice
          must stay visible — there's still a Copy link the user needs — until
          the next submit begins (cleared there, same beat as `error`). */}
      <div role="status" aria-live="polite">
        {success && (
          <div className="bg-success-soft border border-success-soft rounded-control px-4 py-3 text-success-deep">
            Invitation sent successfully!
          </div>
        )}
        {emailNotSent && (
          <div className="mt-2 bg-info-soft border border-info-soft rounded-control px-4 py-3 text-info-deep">
            The invite is saved — the email didn&apos;t go out, so share the link yourself with Copy
            link.
          </div>
        )}
      </div>

      <Input
        label="Invite by email"
        type="email"
        required
        placeholder="curator@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading}
      />

      <Button type="submit" disabled={loading}>
        {loading ? "Sending..." : "Send invite"}
      </Button>
    </form>
  );
}
