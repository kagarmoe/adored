"use client";

import { useSyncExternalStore } from "react";

// A device-local fact (localStorage, or an attribute a pre-hydration script set on
// <html>) cannot be read while rendering on the server, so it can't seed useState:
// the first client render must still match the server's HTML. The house pattern used
// to be "seed a placeholder, then setState in a mount effect" — a cascading render
// React now lints against (react-hooks/set-state-in-effect).
//
// useSyncExternalStore is the sanctioned read: SSR and the hydration render get
// `serverValue`, React re-reads `read()` immediately after mount and re-renders if it
// differs — exactly the two-phase result the mount effect produced. `read` must return
// a primitive (a fresh object every call would loop).
//
// Nothing outside the tab mutates these values mid-life, so there is nothing to
// subscribe to; a component that also WRITES the value keeps its own state override
// (see RoundLengthChooser), which is what preserves the choice when the storage write
// silently fails (private mode).
const noSubscribe = () => () => {};

export function useDeviceValue<T extends string | number | boolean | null>(
  read: () => T,
  serverValue: T,
): T {
  return useSyncExternalStore(noSubscribe, read, () => serverValue);
}
