// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useReducedMotion } from "./useReducedMotion";

type Listener = () => void;

function stubMatchMedia(reduce: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches: reduce,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn((_: string, cb: Listener) => listeners.add(cb)),
    removeEventListener: vi.fn((_: string, cb: Listener) => listeners.delete(cb)),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return { mql, listeners };
}

describe("useReducedMotion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when the user prefers reduced motion", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("returns false when the user does not prefer reduced motion", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("unsubscribes on unmount", () => {
    const { mql } = stubMatchMedia(true);
    const { unmount } = renderHook(() => useReducedMotion());
    expect(mql.addEventListener).toHaveBeenCalledTimes(1);
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it("defaults to false when matchMedia is unavailable (SSR-safe)", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});
