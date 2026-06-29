"use client";

import { useEffect, useState } from "react";

// Flips data-theme on <html> and persists the choice. Reads the current value
// set by ThemeScript so it stays in sync on first paint.
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "dark" || current === "light") setTheme(current);
  }, []);

  function flip() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("pi-theme", next);
    } catch {
      // private mode / storage disabled — the in-memory toggle still works
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="inline-flex h-11 min-w-11 items-center justify-center rounded-control px-3 text-ink transition-colors hover:bg-content-soft/40"
    >
      <span aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span>
    </button>
  );
}
