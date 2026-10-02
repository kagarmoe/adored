import type { Item } from "@/types";

export const NAME_NEEDED = "Give it a name to save";
const TEXT = ["name", "brand", "style", "color", "material", "category", "notes", "story"] as const;
const MEASURES = ["height", "width", "depth", "weight"] as const;
type TextField = (typeof TEXT)[number];
type Measure = (typeof MEASURES)[number];
export type Unit = "imperial" | "metric";
export type PanelFields = Record<TextField | Measure, string> & { unit: Unit };
export type ItemPatch = { name?: string; unit?: Unit } & Partial<Record<Exclude<TextField, "name">, string | null>> &
  Partial<Record<Measure, number | null>>;

export function fieldsFromItem(item: Item): PanelFields {
  const s = (v: string | null) => v ?? "";
  return {
    name: s(item.name), brand: s(item.brand), style: s(item.style), color: s(item.color),
    material: s(item.material), category: s(item.category), notes: s(item.notes), story: s(item.story),
    height: s(item.height), width: s(item.width), depth: s(item.depth), weight: s(item.weight),
    // Legacy rows hold "in"; anything that isn't metric reads as imperial.
    unit: item.unit === "metric" ? "metric" : "imperial",
  };
}

export const isDirty = (a: PanelFields, b: PanelFields) =>
  (Object.keys(a) as (keyof PanelFields)[]).some((k) => a[k] !== b[k]);

/** Only the fields that changed since the last save — never the whole record. */
export function buildItemPatch(
  saved: PanelFields,
  current: PanelFields,
): { ok: true; patch: ItemPatch } | { ok: false; reason: "blank-name" } {
  const patch: ItemPatch = {};
  for (const f of TEXT) {
    if (current[f] === saved[f]) continue;
    const v = current[f].trim();
    if (f === "name") {
      if (!v) return { ok: false, reason: "blank-name" };
      patch.name = v;
    } else patch[f] = v === "" ? null : v;
  }
  for (const f of MEASURES) {
    if (current[f] !== saved[f]) patch[f] = current[f].trim() === "" ? null : Number(current[f]);
  }
  if (current.unit !== saved.unit) patch.unit = current.unit;
  return { ok: true, patch };
}
