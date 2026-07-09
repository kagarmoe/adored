import type { UsageAnswer } from "@/lib/derive-usage";
import type { Item, Disposition } from "@/types";

// The eligible remainder for a usage round (parent D2): usage still unknown AND
// not disposed — BOTH set_aside and deferred are excluded. Untriaged items ARE
// included: usage is a primary sort with no triage prerequisite. Input order is
// preserved. Returns bare Item[] — the deliberate fork from selectTriageQueue:
// a defer here is a love-question disposition, honored by absence, not surfaced
// as a deferred flag or banner (spec §7.7, user-confirmed).
export function selectUsageQueue(
  items: Item[],
  usageByItemId: ReadonlyMap<string, UsageAnswer>,
  dispositionByItemId: Map<string, Disposition>,
): Item[] {
  return items.filter(
    (i) => !usageByItemId.has(i.id) && dispositionByItemId.get(i.id) === undefined,
  );
}
