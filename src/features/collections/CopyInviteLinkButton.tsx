"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

interface CopyInviteLinkButtonProps {
  token: string;
}

export function CopyInviteLinkButton({ token }: CopyInviteLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  // Auto-reset the "Copied" label after ~2s, cleaning the timer up on unmount so we
  // never call setCopied on an unmounted component (mirrors InviteForm's success reset).
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function handleClick() {
    const url = `${window.location.origin}/invitations/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="secondary" onClick={handleClick}>
        {copied ? "Copied" : "Copy link"}
      </Button>
      {/* Mounted for the component's whole life, not gated on `copied`: a live region
          must already exist when its text changes, or AT never observes the mutation
          (the InviteForm precedent — a region born with its text is frequently skipped). */}
      <div role="status" aria-live="polite" className="sr-only">
        {copied && "Invite link copied"}
      </div>
    </div>
  );
}
