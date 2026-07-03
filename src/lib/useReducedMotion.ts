"use client";

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

// Reports whether the user has asked for reduced motion. SSR-safe: defaults to false
// when there is no window/matchMedia, then subscribes to changes on mount and cleans
// up on unmount. Callers that gate animation on this MUST still fire any expiry
// callback (reduced motion suppresses the animation, not the round ending).
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(QUERY);
    setReduced(mql.matches);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
