import type { ReactNode } from "react";

interface TimerRingProps {
  fraction: number;
  size: number;
  expired?: boolean;
  discClassName?: string;
  className?: string;
  children?: ReactNode;
}

/**
 * The quiet ring (wireframes: "violet ring = round timer (no digits)"), shared by
 * the header display, the set-length dial, and the recap badge. HTML+CSS only:
 * a conic-gradient band (0.5% blended stop kills hard-edge aliasing) around a
 * disc that matches the host backdrop. Expired = gold band + ink ✓ (colour is
 * never the sole signal; the consumer's live region carries the words).
 */
export function TimerRing({ fraction, size, expired = false, discClassName = "bg-surface", className = "", children }: TimerRingProps) {
  const pct = Math.min(1, Math.max(0, fraction)) * 100;
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-full ${expired ? "bg-spark" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        background: expired
          ? undefined
          : `conic-gradient(var(--color-ring-sweep) calc(${pct}% - 0.5%), var(--color-ring-track) ${pct}%)`,
      }}
    >
      <div
        className={`flex items-center justify-center rounded-full ${discClassName}`}
        style={{ width: size * 0.75, height: size * 0.75 }}
      >
        {expired ? (
          <span aria-hidden className="text-ink" style={{ fontSize: size * 0.4 }}>
            ✓
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
