import { describe, expect, it } from "vitest";
import type { CollectionPreferenceItem, Item, RankBucket } from "@/types";
import { selectComparableItems } from "./compare-selection";

const item = (id: string, archived = false) => ({ id, deletedAt: archived ? new Date(0) : null }) as Item;
const pref = (itemId: string, rankBucket: RankBucket) => ({ itemId, rankBucket }) as CollectionPreferenceItem;

describe("selectComparableItems (spec §4: comparable set = Love + Like)", () => {
  it("keeps only live Love and Like pieces", () => {
    const items = [item("love"), item("like"), item("maybe"), item("onward"), item("untriaged"), item("archived", true)];
    const prefs = [pref("love", "top"), pref("like", "high"), pref("maybe", "medium"), pref("onward", "low"), pref("archived", "top")];
    expect(selectComparableItems(items, prefs).map((i) => i.id)).toEqual(["love", "like"]);
  });
});
