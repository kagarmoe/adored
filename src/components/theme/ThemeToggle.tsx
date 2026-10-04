"use client";

import { useState } from "react";
import { useDeviceValue } from "@/lib/useDeviceValue";

type Theme = "light" | "dark";

// ThemeScript writes data-theme on <html> before paint, so the attribute — not this
// component — is the source of truth on arrival. It is device-local (invisible to the
// server render), hence the useDeviceValue read.
const readTheme = (): Theme =>
  document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

// Flips data-theme on <html> and persists the choice. Reads the current value
// set by ThemeScript so it stays in sync on first paint.
export function ThemeToggle() {
  const painted = useDeviceValue<Theme>(readTheme, "light");
  // The flip is remembered here rather than re-read from the DOM: a failed
  // localStorage write (private mode) must still leave the toggle in its new state.
  const [flipped, setFlipped] = useState<Theme | null>(null);
  const theme = flipped ?? painted;

  function flip() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("pi-theme", next);
    } catch {
      // private mode / storage disabled — the in-memory toggle still works
    }
    setFlipped(next);
  }

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="inline-flex h-11 min-w-11 items-center justify-center rounded-control px-3 text-ink transition-colors hover:bg-content-soft"
    >
      <span aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span>
    </button>
  );
}
