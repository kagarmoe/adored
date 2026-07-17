"use client";

import { useState, type ChangeEvent } from "react";
import { getRoundBox, setRoundBox, DEFAULT_ROUND_BOX, type RoundBoxSeconds } from "@/lib/round-preference";
import { useDeviceValue } from "@/lib/useDeviceValue";

// Deleted in Task 6 (replaced by the dial UI) — options list is inlined rather
// than shared, since there's no second consumer left to justify exporting it.
const ROUND_BOX_OPTIONS: { value: RoundBoxSeconds; label: string }[] = [
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 120, label: "2 minutes" },
  { value: 300, label: "5 minutes" },
  { value: "none", label: "No timer" },
];

interface RoundLengthChooserProps {
  /** Fires with the newly chosen box so the LIVE round re-arms its clock against
   *  its unchanged start (the consumer maps "none" → null, else `boxToMs(box)`). */
  onChange: (box: RoundBoxSeconds) => void;
}

/**
 * A compact round-length select (parent D2): switchable BEFORE and DURING a round.
 * On change it both persists the device-local preference (`setRoundBox`, so the next
 * round inherits it) AND calls `onChange` so the mounted round re-arms its box live —
 * "No timer" is a first-class peer in the same list, never a hidden mode.
 */
export function RoundLengthChooser({ onChange }: RoundLengthChooserProps) {
  // SSR and the first client render show the stable literal (getRoundBox reads
  // localStorage → would mismatch on hydration); the real stored box lands right after
  // mount, matching the sibling clock (RoundSurface/useOptimisticRound). The person's
  // own choice overrides the stored one — a failed persist must not snap the select back.
  const stored = useDeviceValue<RoundBoxSeconds>(getRoundBox, DEFAULT_ROUND_BOX);
  const [chosen, setChosen] = useState<RoundBoxSeconds | null>(null);
  const value = chosen ?? stored;

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const raw = event.target.value;
    const box: RoundBoxSeconds = raw === "none" ? "none" : (Number(raw) as RoundBoxSeconds);
    setChosen(box);
    setRoundBox(box); // persist for the next round…
    onChange(box); // …and re-arm this round's clock now
  }

  return (
    <select
      aria-label="Round length"
      value={String(value)}
      onChange={handleChange}
      className="h-11 rounded-control border border-hairline bg-surface px-3 text-sm text-ink transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
    >
      {ROUND_BOX_OPTIONS.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
