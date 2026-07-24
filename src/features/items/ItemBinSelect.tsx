"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

// The four bins, stored verbatim in items.category (a plain constrained label —
// deliberately NOT wired into sort preferences/decision events; the owner chose
// the simple field over the sorting engine for details-page binning).
// ponytail: if bins must ever feed Standing/results, the parked
// feat/item-detail-binning branch holds the full decision-event path.
const BINS = ["Love", "Like", "Maybe", "Onward"] as const;

interface ItemBinSelectProps {
  itemId: string;
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
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: next || null }),
      });
      if (!res.ok) throw new Error("save failed");
      setNotice(next ? `Placed with ${next}.` : "Placement cleared.");
      router.refresh();
    } catch {
      setCurrent(prior);
      setNotice(
        prior
          ? `That didn’t save — it’s still placed with ${prior}; try again in a moment.`
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
          ...BINS.map((b) => ({ value: b, label: b })),
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
