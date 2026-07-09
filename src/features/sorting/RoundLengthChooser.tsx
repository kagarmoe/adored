"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { getRoundBox, setRoundBox, ROUND_BOX_OPTIONS, DEFAULT_ROUND_BOX, type RoundBox } from "@/lib/round-preference";

interface RoundLengthChooserProps {
  /** Fires with the newly chosen box so the LIVE round re-arms its clock against
   *  its unchanged start (the consumer maps "none" → null, else box·MINUTE_MS). */
  onChange: (box: RoundBox) => void;
}

/**
 * A compact round-length select (parent D2): switchable BEFORE and DURING a round.
 * On change it both persists the device-local preference (`setRoundBox`, so the next
 * round inherits it) AND calls `onChange` so the mounted round re-arms its box live —
 * "No timer" is a first-class peer in the same list, never a hidden mode.
 */
export function RoundLengthChooser({ onChange }: RoundLengthChooserProps) {
  // Seed to a stable literal so SSR and the first client render agree (getRoundBox
  // reads localStorage → would mismatch on hydration); reconcile to the real stored
  // box in a mount effect, matching the sibling clock (RoundSurface/useOptimisticRound).
  const [value, setValue] = useState<RoundBox>(DEFAULT_ROUND_BOX);

  useEffect(() => {
    setValue(getRoundBox());
  }, []);

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const raw = event.target.value;
    const box: RoundBox = raw === "none" ? "none" : (Number(raw) as RoundBox);
    setValue(box);
    setRoundBox(box); // persist for the next round…
    onChange(box); // …and re-arm this round's clock now
  }

  return (
    <select
      aria-label="Round length"
      value={String(value)}
      onChange={handleChange}
      className="h-11 rounded-control border border-hairline bg-surface px-3 text-sm text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
    >
      {ROUND_BOX_OPTIONS.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
