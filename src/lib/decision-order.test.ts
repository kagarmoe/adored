import { describe, it, expect } from "vitest";
import { ulid } from "ulid";
import { compareByCreatedAtThenId } from "./decision-order";

const at = (ms: number) => new Date(ms);
const ev = (id: string, ms: number) => ({ id, createdAt: at(ms) });

// The two comparators being replaced, reproduced verbatim as oracles:
// ScoringService.ts:91 (localeCompare) and insertion-ranking.ts isAfter (`>`).
const oldScoring = (a: { id: string; createdAt: Date }, b: { id: string; createdAt: Date }) => {
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
};
const oldRankingSign = (a: { id: string; createdAt: Date }, b: { id: string; createdAt: Date }) => {
  const ta = a.createdAt.getTime(),
    tb = b.createdAt.getTime();
  if (ta !== tb) return ta > tb ? 1 : -1;
  return a.id > b.id ? 1 : a.id < b.id ? -1 : 0;
};
const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

// Realistic corpus: prefixed lowercase ULIDs, BOTH prefixes that exist in the
// table (`event_` from generateId, `evt_` from legacy seed/DB-test paths).
function corpus(n: number) {
  const out: Array<{ id: string; createdAt: Date }> = [];
  for (let i = 0; i < n; i++) {
    const prefix = i % 3 === 0 ? "evt" : "event";
    out.push(ev(`${prefix}_${ulid().toLowerCase()}`, 1000 + (i % 7)));
  }
  return out;
}

describe("compareByCreatedAtThenId", () => {
  it("orders by createdAt first", () => {
    expect(sign(compareByCreatedAtThenId(ev("event_b", 1), ev("event_a", 2)))).toBe(-1);
    expect(sign(compareByCreatedAtThenId(ev("event_a", 2), ev("event_b", 1)))).toBe(1);
  });
  it("breaks createdAt ties by code-unit id", () => {
    expect(sign(compareByCreatedAtThenId(ev("event_a", 5), ev("event_b", 5)))).toBe(-1);
    expect(sign(compareByCreatedAtThenId(ev("event_a", 5), ev("event_a", 5)))).toBe(0);
  });
  it("property: sign-equal with BOTH old comparators on the realistic corpus (F10)", () => {
    const items = corpus(300);
    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < items.length; j += 17) {
        const a = items[i],
          b = items[j % items.length];
        const s = sign(compareByCreatedAtThenId(a, b));
        expect(s).toBe(sign(oldScoring(a, b)));
        expect(s).toBe(sign(oldRankingSign(a, b)));
      }
    }
  });
  it("at equal createdAt, event_ sorts before evt_ (documented cross-format tie)", () => {
    const a = ev(`event_${ulid().toLowerCase()}`, 9);
    const b = ev(`evt_${ulid().toLowerCase()}`, 9);
    expect(sign(compareByCreatedAtThenId(a, b))).toBe(-1); // "event_" < "evt_" code-unit ('e'<'t' at index 2)
  });
});
