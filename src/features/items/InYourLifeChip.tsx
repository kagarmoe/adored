"use client";
import { useId, useState } from "react";
import type { UsageAnswer } from "@/lib/derive-usage";
import { IN_LIFE_CHIP, RESTING_CHIP } from "./usage-chip-copy";

const OPTIONS: [UsageAnswer, string][] = [["uses", "I use this"], ["not_uses", RESTING_CHIP]];
const JSON_HEADERS = { "Content-Type": "application/json" };

export function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface Props { collectionId: string; itemId: string; sessionId: string | null; initial?: UsageAnswer }

// Unset until tapped (untouched means no decision); once set it toggles between the two
// answers. Writes a `usage` event through the decision route, which needs the curator's
// in-progress session — with none open, the first tap starts one.
export function InYourLifeChip({ collectionId, itemId, sessionId, initial }: Props) {
  const labelId = useId();
  const [value, setValue] = useState(initial);
  const [sid, setSid] = useState(sessionId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function choose(next: UsageAnswer) {
    if (busy || next === value) return;
    const prev = value;
    setValue(next);
    setBusy(true);
    setError("");
    try {
      let id = sid;
      if (!id) {
        const res = await fetch("/api/sessions", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ collectionId }) });
        if (!res.ok) throw new Error("session");
        id = ((await res.json()) as { id: string }).id;
        setSid(id);
      }
      const res = await fetch(`/api/sessions/${id}/decisions`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ type: "usage", decision: { itemId, result: next } }),
      });
      // 409: that session finished elsewhere — forget it so the next tap starts a fresh one.
      if (res.status === 409) setSid(null);
      if (!res.ok) throw new Error("decision");
    } catch {
      setValue(prev);
      setError("That didn't save — try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div role="group" aria-labelledby={labelId} className="space-y-2">
      <p id={labelId} className="text-sm font-semibold text-ink">{IN_LIFE_CHIP}</p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map(([v, label]) => {
          const on = value === v;
          return (
            <button key={v} type="button" aria-pressed={on} onClick={() => choose(v)}
              className={`inline-flex h-11 items-center gap-2 rounded-pill border px-4 text-sm transition-colors ${on ? "border-primary bg-chip font-semibold text-chip-ink" : "border-hairline text-ink"}`}>
              {on && <CheckIcon />}
              {label}
            </button>
          );
        })}
      </div>
      <p role="status" className="text-sm text-ink-soft">{error}</p>
    </div>
  );
}
