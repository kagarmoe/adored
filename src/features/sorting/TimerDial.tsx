"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { roundBoxLabel, MAX_BOX_SECONDS, type RoundBoxSeconds } from "@/lib/round-preference";
import { angleToBox, boxToAngle, pointToAngle, stepBox } from "./round-dial";
import { TimerRing } from "./TimerRing";

interface TimerDialProps {
  value: RoundBoxSeconds;
  onChange: (box: RoundBoxSeconds) => void;
  size?: number;
  discClassName?: string;
}

/**
 * The touch-set length dial: TimerRing at dial size + a visible handle at the
 * value angle (the draggability signifier and the drag target). Reports every
 * previewed value via onChange — the HOST owns commit semantics (the mid-round
 * dialog commits on Done only, because a commit below elapsed ends the round).
 */
export function TimerDial({ value, onChange, size = 200, discClassName = "bg-surface-raised" }: TimerDialProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function valueFromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = surfaceRef.current!.getBoundingClientRect();
    const angle = pointToAngle(rect.left + rect.width / 2, rect.top + rect.height / 2, event.clientX, event.clientY);
    const next = angleToBox(angle);
    if (next !== value) onChange(next);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    surfaceRef.current?.setPointerCapture(event.pointerId);
    valueFromPointer(event);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragging.current) valueFromPointer(event);
  }
  function onPointerUp() {
    dragging.current = false;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: RoundBoxSeconds | undefined;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") next = stepBox(value, 1);
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") next = stepBox(value, -1);
    else if (event.key === "Home") next = "none";
    else if (event.key === "End") next = MAX_BOX_SECONDS as RoundBoxSeconds;
    if (next !== undefined) {
      event.preventDefault();
      if (next !== value) onChange(next);
    }
  }

  const handleAngle = boxToAngle(value);
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={surfaceRef}
        role="slider"
        tabIndex={0}
        aria-label="Round length"
        aria-valuemin={0}
        aria-valuemax={300}
        aria-valuenow={value === "none" ? 0 : value}
        aria-valuetext={roundBoxLabel(value)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        className="touch-none rounded-full focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
      >
        <TimerRing fraction={value === "none" ? 0 : value / 300} size={size} discClassName={discClassName}>
          {value !== "none" && (
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 h-4 w-4 rounded-full border-2 border-surface bg-ring-sweep"
              style={{
                transform: `translate(-50%, -50%) rotate(${handleAngle}deg) translateY(-${size / 2 - 8}px)`,
              }}
            />
          )}
        </TimerRing>
      </div>
      <p className="text-sm text-ink" aria-hidden>
        {roundBoxLabel(value)}
      </p>
      <p className="text-xs text-ink-soft">Drag or tap to set.</p>
    </div>
  );
}
