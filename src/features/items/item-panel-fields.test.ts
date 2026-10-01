import { describe, expect, it } from "vitest";
import { buildItemPatch, type PanelFields } from "./item-panel-fields";
const base: PanelFields = {
  name: "Tote", brand: "Coach", style: "", color: "", material: "", category: "", notes: "",
  story: "", height: "", width: "", depth: "", weight: "2", unit: "imperial",
};
describe("buildItemPatch", () => {
  it("sends only changed fields: trimmed text, null clears, numbers, unit", () => {
    const r = buildItemPatch(base, { ...base, brand: "", style: " Hobo ", height: "30", weight: "", unit: "metric" });
    expect(r).toEqual({ ok: true, patch: { brand: null, style: "Hobo", height: 30, weight: null, unit: "metric" } });
  });
  it("refuses a blank name instead of sending it", () => {
    expect(buildItemPatch(base, { ...base, name: "  " })).toEqual({ ok: false, reason: "blank-name" });
  });
  it("never sends an untouched blank name (a nameless item stays nameless)", () => {
    const nameless = { ...base, name: "" };
    expect(buildItemPatch(nameless, { ...nameless, notes: "Gift" })).toEqual({ ok: true, patch: { notes: "Gift" } });
  });
});
