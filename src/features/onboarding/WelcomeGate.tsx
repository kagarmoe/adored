"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isWelcomeDismissed } from "./dismissal";

interface WelcomeGateProps {
  /** Server-known: whether the signed-in user owns any collections. */
  hasCollections: boolean;
}

// The ONE place the first-run walkthrough auto-triggers. Collections count is
// server-known; the dismissal flag is client-only (localStorage) — so the
// decision runs here, mounted on the authed collections entry. Zero collections
// AND not dismissed -> /welcome. Renders nothing.
export function WelcomeGate({ hasCollections }: WelcomeGateProps) {
  const router = useRouter();

  useEffect(() => {
    if (!hasCollections && !isWelcomeDismissed()) {
      router.replace("/welcome");
    }
  }, [hasCollections, router]);

  return null;
}
