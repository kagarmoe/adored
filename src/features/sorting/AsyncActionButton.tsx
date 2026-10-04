"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";

// Shared shell for the sorting control buttons (Keep sorting / Pause / Bring back). Each is a single quiet tap that fires one async action and then
// navigates. The double-submit guard, the identical gentle error notice, and the
// "Just a moment…" busy label all live here so a fix lands in one place.
//
// The caller supplies `action` (the fetch; it throws on a non-ok/rejected
// request) and, on success, decides navigation inside `action` itself via the
// injected router — keeping each button's exact URL/body/nav verbatim. On any
// throw the busy state is rolled back and the gentle notice shows; on success
// the caller has already navigated (the island then unmounts or refreshes).
export function AsyncActionButton({
  action,
  label,
  busyLabel = "Just a moment…",
  variant = "ghost",
  align = "start",
  title,
  ariaLabel,
  fullWidth = false,
  className,
}: {
  action: () => Promise<void>;
  label: string;
  busyLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  align?: "start" | "end";
  title?: string;
  ariaLabel?: string;
  /** Full width below `md` (the phone action bar), natural width above. */
  fullWidth?: boolean;
  className?: string;
}): ReactNode {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function run() {
    if (inFlight.current) return; // a double-tap before `busy` renders is a no-op
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await action(); // caller navigates on success; this island then unmounts/refreshes
    } catch {
      setError("That didn't go through — give it another try in a moment.");
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <div className={`flex flex-col gap-1 ${align === "end" ? "items-end" : "items-start"}${fullWidth ? " w-full md:w-auto" : ""}`}>
      <Button
        type="button"
        variant={variant}
        className={[fullWidth && "w-full md:w-auto", className].filter(Boolean).join(" ") || undefined}
        onClick={run}
        disabled={busy}
        title={title}
        aria-busy={busy}
        // While busy the busy label is the accessible name, so it is announced.
        aria-label={busy ? undefined : ariaLabel}
      >
        {busy ? busyLabel : label}
      </Button>
      {error && (
        <span role="status" className="text-sm text-ink-soft">
          {error}
        </span>
      )}
    </div>
  );
}
