import { describe, expect, it, vi } from "vitest";
import { SAMPLE_ITEMS } from "@/features/onboarding/sampleData";
import { ensureDevSampleCollection, selectRandomSampleItems } from "./dev-sample-bootstrap";

describe("selectRandomSampleItems", () => {
  it("returns exactly five unique sample items from the pool", () => {
    const selected = selectRandomSampleItems(SAMPLE_ITEMS, 5, () => 0);

    expect(selected).toHaveLength(5);
    expect(new Set(selected.map((item) => item.id)).size).toBe(5);
    expect(selected.every((item) => SAMPLE_ITEMS.includes(item))).toBe(true);
  });

  it("caps the selection at the available item count", () => {
    const selected = selectRandomSampleItems(SAMPLE_ITEMS.slice(0, 3), 5, () => 0);

    expect(selected).toHaveLength(3);
  });
});

describe("ensureDevSampleCollection", () => {
  it("does nothing outside the dev auth bypass", async () => {
    const db = { transaction: vi.fn() };

    await ensureDevSampleCollection(db as never, "user_dev");

    expect(db.transaction).not.toHaveBeenCalled();
  });
});
