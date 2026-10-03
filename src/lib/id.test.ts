import { describe, it, expect } from "vitest";
import { generateId, generateOrderedIdFactory } from "./id";
import { compareByCreatedAtThenId } from "./decision-order";

const EVENT_ID = /^event_[0-9a-hjkmnp-tv-z]{26}$/;

describe("generateOrderedIdFactory", () => {
  it("emits ids in the existing generateId('event') format (prefixed, lowercase Crockford)", () => {
    const next = generateOrderedIdFactory();
    expect(next()).toMatch(EVENT_ID);
    expect(generateId("event")).toMatch(EVENT_ID); // format anchor — never drifts apart
  });
  it("two ids in the same millisecond strictly increase (F10)", () => {
    const next = generateOrderedIdFactory();
    const ids = Array.from({ length: 200 }, () => next()); // same-ms runs guaranteed in a tight loop
    for (let i = 1; i < ids.length; i++) expect(ids[i] > ids[i - 1]).toBe(true);
  });
  it("factory order survives prefix + lowercase under the shared comparator: at equal createdAt a later factory id orders after an earlier same-batch id", () => {
    const next = generateOrderedIdFactory();
    const t = new Date(1000);
    const a = { id: next(), createdAt: t };
    const b = { id: next(), createdAt: t };
    expect(compareByCreatedAtThenId(a, b)).toBeLessThan(0);
    // sign-equal with the retired comparators on factory output too:
    expect(a.id.localeCompare(b.id)).toBeLessThan(0);
    expect(a.id < b.id).toBe(true);
  });
});

describe("generateId", () => {
  it("ids minted in the same millisecond strictly increase, so createdAt ties break in creation order (purses-w7ss.16)", () => {
    const ids = Array.from({ length: 200 }, () => generateId("item")); // a tight loop guarantees same-ms runs
    for (let i = 1; i < ids.length; i++) expect(ids[i] > ids[i - 1]).toBe(true);
  });
});
