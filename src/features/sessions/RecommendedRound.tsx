"use client";

import { useEffect, useState } from "react";
import { RecommendedRoundCard } from "./RecommendedRoundCard";
import { hasUsageRoundRan } from "@/lib/usage-round-prefs";
import type { NextRound } from "@/lib/next-round";

interface RoundLink {
  round: NextRound;
  href: string;
}

interface RecommendedRoundProps {
  primary: RoundLink;
  /** Present iff `primary` is a usage recommendation — the demoted twin the ladder
   *  computed by skipping usage (triage → compare → decide). */
  whenUsageDemoted?: RoundLink;
  curatorId: string;
  sessionId: string;
}

/**
 * Thin client shell around the (server-renderable) RecommendedRoundCard. It paints
 * `primary` on the server and first client render, then — after hydration — reads the
 * device-local anti-nagging flag and swaps to `whenUsageDemoted` if THIS (curator,
 * session) already ran a usage round. Same read-device-state-after-hydration pattern
 * as RoundLengthChooser's mount effect.
 *
 * The swap is a plain same-slot re-render: no transition/animation, zero layout shift.
 * The pre-hydration wrong-card window on a demoted hub is an accepted trade-off (§7.2) —
 * no neutral placeholder, since it would flash for the never-demoted majority.
 */
export function RecommendedRound({
  primary,
  whenUsageDemoted,
  curatorId,
  sessionId,
}: RecommendedRoundProps) {
  const [demoted, setDemoted] = useState(false);

  useEffect(() => {
    if (whenUsageDemoted && hasUsageRoundRan(curatorId, sessionId)) {
      setDemoted(true);
    }
  }, [whenUsageDemoted, curatorId, sessionId]);

  const shown = demoted && whenUsageDemoted ? whenUsageDemoted : primary;
  return <RecommendedRoundCard round={shown.round} href={shown.href} />;
}
