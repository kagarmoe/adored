"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

// The four bins as a per-curator overlay on live preferences (purses-xxo7): the
// option VALUE is the rank bucket the overlay writes; the LABEL is the gentle tier
// name (Onward, never Release). effectiveBucket = manualBucket ?? rankBucket wins the
// Standing/results partition — PUT /api/items/[id]/bin, not items.category.
const BINS = [
  { value: "top", label: "Love" },
  { value: "high", label: "Like" },
  { value: "medium", label: "Maybe" },
  { value: "low", label: "Onward" },
] as const;

const labelOf = (value: string): string =>
  BINS.find((b) => b.value === value)?.label ?? "";

interface ItemBinSelectProps {
  itemId: string;
  // The current effective bucket ("top"|"high"|"medium"|"low") or null (not placed).
  value: string | null;
}

export function ItemBinSelect({ itemId, value }: ItemBinSelectProps) {
  const router = useRouter();
  const [current, setCurrent] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);

  async function save(next: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    const prior = current;
    setCurrent(next);
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch(`/api/items/${itemId}/bin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: next || null }),
      });
      if (!res.ok) throw new Error("save failed");
      setNotice(next ? `Placed with ${labelOf(next)}.` : "Placement cleared.");
      router.refresh();
    } catch {
      setCurrent(prior);
      setNotice(
        prior
          ? `That didn’t save — it’s still placed with ${labelOf(prior)}; try again in a moment.`
          : "That didn’t save — nothing changed; try again in a moment.",
      );
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <div className="mt-6">
      <Select
        label="Placed with"
        value={current}
        disabled={busy}
        onChange={(e) => save(e.target.value)}
        options={[
          // A real (selectable) empty option, not the disabled placeholder —
          // clearing a placement must stay possible.
          { value: "", label: "Not placed yet" },
          ...BINS.map((b) => ({ value: b.value, label: b.label })),
        ]}
      />
      {/* Always mounted: a live region created together with its content is not
          reliably announced. */}
      <p role="status" className="mt-2 text-sm text-ink-soft">
        {notice}
      </p>
    </div>
  );
}
