"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Textarea } from "@/components/ui";
import type { Item } from "@/types";
import { buildItemPatch, fieldsFromItem, isDirty, NAME_NEEDED, type PanelFields } from "./item-panel-fields";
import { useLeaveGuard } from "./useLeaveGuard";

const TEXT_INPUTS = [
  ["brand", "Brand", "Add a brand"], ["style", "Style", "Add a style"], ["color", "Color", "Add a color"],
  ["material", "Material", "Add a material"], ["category", "Category", "Add a category"],
] as const;

export function ItemPanelForm({ item, collectionId }: { item: Item; collectionId: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => fieldsFromItem(item));
  const [fields, setFields] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const dirty = isDirty(saved, fields);
  useLeaveGuard(dirty);
  const set = (k: keyof PanelFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFields((f) => ({ ...f, [k]: e.target.value }));
    setNote(""); // "Saved." / the name line describe the last action, not the next edit
  };
  const revertName = () => {
    setFields((f) => ({ ...f, name: saved.name }));
    setNote(NAME_NEEDED);
  };
  const len = fields.unit === "metric" ? "cm" : "in";
  const wt = fields.unit === "metric" ? "kg" : "lb";
  const dims = [fields.height, fields.width, fields.depth].filter((v) => v.trim()).join(" × ");
  const sizeHint = [dims && `${dims} ${len}`, fields.weight.trim() && `${fields.weight} ${wt}`]
    .filter(Boolean).join(" · ") || "Add measurements";
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const result = buildItemPatch(saved, fields);
    if (!result.ok) return revertName();
    const sent = fields;
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/collections/${collectionId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.patch),
      });
      if (!res.ok) throw new Error("save failed");
      // Adopt what the server kept (trimmed text, normalized numbers); keep anything typed meanwhile.
      const next = fieldsFromItem((await res.json()) as Item);
      setSaved(next);
      setFields((cur) => (cur === sent ? next : cur));
      setNote("Saved.");
      router.refresh();
    } catch {
      setNote("That didn't save — your changes are still here; try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} aria-label="Details" className="space-y-4">
      <Input
        name="name" label="Name" value={fields.name} onChange={set("name")} maxLength={200}
        placeholder="Give it a name"
        onBlur={() => { if (fields.name !== saved.name && !fields.name.trim()) revertName(); }}
      />
      {TEXT_INPUTS.map(([k, label, prompt]) => (
        <Input key={k} name={k} label={label} value={fields[k]} onChange={set(k)} placeholder={prompt} maxLength={200} />
      ))}
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-control text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
          <span className="font-medium text-ink">Size</span>
          <span className="min-w-0 flex-1 truncate text-ink-soft">{sizeHint}</span>
          <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 text-ink-soft transition-transform group-open:rotate-180">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <fieldset className="mt-2 flex gap-4">
          <legend className="sr-only">Units</legend>
          {(["imperial", "metric"] as const).map((u) => (
            <label key={u} className="inline-flex min-h-11 items-center gap-2 text-sm text-ink">
              <input type="radio" name="unit" value={u} checked={fields.unit === u}
                onChange={() => { setFields((f) => ({ ...f, unit: u })); setNote(""); }} />
              {u === "metric" ? "cm · kg" : "in · lb"}
            </label>
          ))}
        </fieldset>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["height", "width", "depth"] as const).map((k) => (
            <Input key={k} name={k} type="number" inputMode="decimal" min={0} max={100000} step="any" value={fields[k]}
              onChange={set(k)} label={`${k[0].toUpperCase()}${k.slice(1)} (${len})`} />
          ))}
          <Input name="weight" type="number" inputMode="decimal" min={0} max={100000} step="any" value={fields.weight}
            onChange={set("weight")} label={`Weight (${wt})`} />
        </div>
      </details>
      <Textarea name="notes" label="Notes" value={fields.notes} onChange={set("notes")} placeholder="Add a note" maxLength={5000} />
      <Textarea name="story" label="Where will it go next?" value={fields.story} onChange={set("story")}
        placeholder="To my niece, who always borrowed it…" maxLength={2000} />
      {/* Mounted always: a live region must exist before its text changes. */}
      <p role="status" className="min-h-5 text-sm text-ink-soft">{note}</p>
      {dirty && <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>}
    </form>
  );
}
