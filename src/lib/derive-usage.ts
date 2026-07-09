// Usage is DERIVED at read time (parent D3 — no projection table): the latest
// usage event per item wins, resolved by the ONE shared (createdAt, id)
// comparator the scorer already uses (parent ARCH-6), so the round queue, the
// hub ladder, and (Epic S) Standing can never disagree about "known".
import { compareByCreatedAtThenId } from "@/lib/decision-order";
import type { DecisionEvent, UsageDecision } from "@/types";

export type UsageAnswer = "uses" | "not_uses";

export function deriveUsage(
  events: readonly DecisionEvent[],
  liveItemIds: ReadonlySet<string>,
): Map<string, UsageAnswer> {
  const usage = events
    .filter((e) => e.type === "usage")
    .sort(compareByCreatedAtThenId);
  const byItem = new Map<string, UsageAnswer>();
  for (const e of usage) {
    const d = e.decision as UsageDecision;
    if (liveItemIds.has(d.itemId)) byItem.set(d.itemId, d.result);
  }
  return byItem;
}
