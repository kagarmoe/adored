"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Button } from "@/components/ui";
import { TierBadge } from "@/components/ui/TierBadge";
import { usageChipLabel } from "@/features/items/usage-chip-copy";
import {
  buildTriageStanding,
  type SampleItem,
  type Tier,
  type TriageOutcome,
  type UsageOutcome,
} from "./sampleData";

interface WelcomeRoundStandingProps {
  stage: "triage" | "usage";
  triage: Record<string, TriageOutcome>;
  usageByItemId?: Record<string, UsageOutcome>;
  onNext: () => void;
}

const COPY = {
  triage: {
    heading: "After Triage",
    body: "Your first groups are taking shape.",
    cta: "Continue",
  },
  usage: {
    heading: "After Usage",
    body: "The Triage order stays. Usage adds a note to each piece.",
    cta: "Continue",
  },
} as const;

export function WelcomeRoundStanding({
  stage,
  triage,
  usageByItemId,
  onNext,
}: WelcomeRoundStandingProps) {
  const standing = buildTriageStanding(triage);
  const copy = COPY[stage];

  return (
    <section
      aria-labelledby={`welcome-${stage}-standing-heading`}
      className="flex flex-col items-center text-center gap-6"
    >
      <div className="space-y-2">
        <h1
          id={`welcome-${stage}-standing-heading`}
          className="font-display text-3xl sm:text-4xl text-ink"
        >
          {copy.heading}
        </h1>
        <p className="mx-auto max-w-md text-ink-soft">{copy.body}</p>
      </div>

      {standing.ranked.length > 0 && (
        <ol className="flex w-full max-w-sm flex-col gap-2">
          {standing.ranked.map((row, index) => (
            <StandingRow
              key={row.item.id}
              item={row.item}
              tier={row.tier}
              rank={index + 1}
              usage={usageFor(row.item, usageByItemId)}
            />
          ))}
        </ol>
      )}

      {standing.setAside.length > 0 && (
        <StandingGroup label="Set aside">
          {standing.setAside.map((item) => (
            <StandingRow key={item.id} item={item} />
          ))}
        </StandingGroup>
      )}

      {standing.deferred.length > 0 && (
        <StandingGroup label="Ready when you are">
          {standing.deferred.map((item) => (
            <StandingRow key={item.id} item={item} />
          ))}
        </StandingGroup>
      )}

      <Button size="lg" onClick={onNext}>
        {copy.cta}
      </Button>
    </section>
  );
}

function usageFor(
  item: SampleItem,
  usageByItemId?: Record<string, UsageOutcome>,
): "uses" | "not_uses" | null {
  const usage = usageByItemId?.[item.id];
  if (usage?.kind === "used") return "uses";
  if (usage?.kind === "unused") return "not_uses";
  return null;
}

function StandingGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex w-full flex-col items-center gap-2">
      <h2 className="font-display text-xl text-ink-soft">{label}</h2>
      <ol className="flex w-full max-w-sm flex-col gap-2">{children}</ol>
    </section>
  );
}

function StandingRow({
  item,
  tier,
  rank,
  usage,
}: {
  item: SampleItem;
  tier?: Tier;
  rank?: number;
  usage?: "uses" | "not_uses" | null;
}) {
  return (
    <li className="flex items-center gap-3 rounded-card border border-hairline bg-surface p-2">
      {rank && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-content-soft text-sm font-semibold text-ink">
          {rank}
        </span>
      )}
      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-control bg-content-soft">
        <Image src={item.imageSrc} alt={item.name} fill className="object-cover" unoptimized />
      </span>
      <span className="flex-1 text-left text-ink">{item.name}</span>
      <span className="flex shrink-0 items-center gap-2">
        {usage && (
          <span className="rounded-full bg-content-soft px-2 py-1 text-xs font-semibold text-ink">
            {usageChipLabel(usage)}
          </span>
        )}
        {tier && <TierBadge tier={tier} showLabel={false} />}
      </span>
    </li>
  );
}
