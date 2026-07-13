"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function supported(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function subscribe(onChange: () => void): () => void {
  if (!supported()) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getSnapshot = (): boolean => (supported() ? window.matchMedia(QUERY).matches : false);
const getServerSnapshot = (): boolean => false;

// Reports whether the user has asked for reduced motion. The media query is an external
// store, so it is read through useSyncExternalStore: SSR (and the hydration render) get
// false, the real value lands right after mount, and a change to the OS setting
// re-renders through the subscription. Callers that gate animation on this MUST still
// fire any expiry callback (reduced motion suppresses the animation, not the round ending).
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
