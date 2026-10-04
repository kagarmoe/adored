import { describe, it, expect } from "vitest";
import { generateId } from "./id";
import { compareByCreatedAtThenId } from "./decision-order";

const EVENT_ID = /^event_[0-9a-hjkmnp-tv-z]{26}$/;

describe("generateId", () => {
  it("event ids minted in the same millisecond strictly increase, so at a shared createdAt a later batch entry orders after an earlier one under the shared comparator (purses-w7ss.16, .20)", () => {
    const t = new Date(1000);
    // A tight loop guarantees same-ms runs; this is what the batch route relies on.
    const rows = Array.from({ length: 200 }, () => ({ id: generateId("event"), createdAt: t }));
    for (const r of rows) expect(r.id).toMatch(EVENT_ID);
    for (let i = 1; i < rows.length; i++) {
      expect(compareByCreatedAtThenId(rows[i - 1], rows[i])).toBeLessThan(0);
      // sign-equal with the retired comparators:
      expect(rows[i - 1].id.localeCompare(rows[i].id)).toBeLessThan(0);
      expect(rows[i].id > rows[i - 1].id).toBe(true);
    }
  });
});
