export type Bucket = "top" | "high" | "medium" | "low";

export interface ComparisonEvent {
  aId: string;
  bId: string;
  result: "item_a" | "item_b" | "tie" | "skip";
  createdAt: Date;
  id: string;
}

export type Outcome = "x_more" | "y_more" | "tie" | "skip" | "unknown";

function isAfter(a: ComparisonEvent, b: ComparisonEvent): boolean {
  const ta = a.createdAt.getTime();
  const tb = b.createdAt.getTime();
  if (ta !== tb) return ta > tb;
  return a.id > b.id;
}

export function latestOutcome(comparisons: ComparisonEvent[], x: string, y: string): Outcome {
  let latest: ComparisonEvent | null = null;
  for (const c of comparisons) {
    const matches = (c.aId === x && c.bId === y) || (c.aId === y && c.bId === x);
    if (!matches) continue;
    if (latest === null || isAfter(c, latest)) latest = c;
  }
  if (latest === null) return "unknown";
  if (latest.result === "tie") return "tie";
  if (latest.result === "skip") return "skip";
  // result is item_a or item_b, expressed in stored (aId,bId) direction; orient to x.
  const winnerId = latest.result === "item_a" ? latest.aId : latest.bId;
  return winnerId === x ? "x_more" : "y_more";
}

export type Placement =
  | { status: "placed"; index: number }
  | { status: "pending"; pivotId: string }
  | { status: "skipped" };

export function placeItem(x: string, ordered: string[], comparisons: ComparisonEvent[]): Placement {
  let lo = 0;
  let hi = ordered.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const pivot = ordered[mid];
    const o = latestOutcome(comparisons, x, pivot);
    if (o === "unknown") return { status: "pending", pivotId: pivot };
    if (o === "skip") return { status: "skipped" };
    if (o === "x_more") {
      hi = mid; // x is more loved => earlier slot
    } else {
      // y_more or tie => x sits at/after the pivot
      lo = mid + 1;
    }
  }
  return { status: "placed", index: lo };
}
