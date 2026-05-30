"use client";

import { useState } from "react";
import { Button, Input, ErrorMessage } from "@/components/ui";
import { PermissionCheckboxes } from "./PermissionCheckboxes";
import { apiPost } from "@/lib/api-client";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  canAddItems: z.boolean(),
  canDeleteItems: z.boolean(),
  canAddPhotos: z.boolean(),
  canDeletePhotos: z.boolean(),
  canInviteMembers: z.boolean(),
  canManageCollection: z.boolean(),
  canCreateSession: z.boolean(),
  canViewResults: z.boolean(),
});

interface InviteFormProps {
  collectionId: string;
  onSuccess?: () => void;
}

export function InviteForm({ collectionId, onSuccess }: InviteFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    canAddItems: true,
    canDeleteItems: false,
    canAddPhotos: true,
    canDeletePhotos: false,
    canInviteMembers: false,
    canManageCollection: false,
    canCreateSession: true,
    canViewResults: true,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const validated = inviteSchema.parse(formData);
      await apiPost(`/api/collections/${collectionId}/invitations`, validated);
      setSuccess(true);
      setFormData({
        email: "",
        canAddItems: true,
        canDeleteItems: false,
        canAddPhotos: true,
        canDeletePhotos: false,
        canInviteMembers: false,
        canManageCollection: false,
        canCreateSession: true,
        canViewResults: true,
      });
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
      <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-900">
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
        value={formData.email}
        onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
        disabled={loading}
      />

      <div>
        <h3 className="font-semibold text-gray-900 mb-4">Permissions</h3>
        <PermissionCheckboxes
          values={formData}
          onChange={(key, value) =>
            setFormData((prev) => ({ ...prev, [key]: value }))
          }
          disabled={loading}
        />
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Sending..." : "Send Invitation"}
      </Button>
    </form>
  );
}
