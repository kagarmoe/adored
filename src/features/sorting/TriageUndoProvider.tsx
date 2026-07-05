"use client";

import { createContext, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// The set-aside undo, hoisted out of the empty-state branch. The BUTTON
// (SetAsideButton) lives inside the triage decision sub-row, but the NOTICE
// (TriageUndoNotice) renders OUTSIDE the `{!item ? <EmptyState/> : …}` ternary —
// so when the curator sets aside the LAST untriaged item and the item branch
// unmounts (item === null), the "Bring back" undo still shows. The durable
// "Set aside" list recovers it too, but the spec's promise is that the inline
// undo survives a refresh (§11) — including the refresh that empties the queue.
//
// State + fetch logic live here, in a context that wraps the whole page, so it
// outlives the item branch's mount/unmount. There is deliberately no
// auto-dismiss timer — a countdown reads as a deadline, and this is a gentle
// escape, not a race (TONE.md, commitment 4).
//
// collectionId MUST be the ULID collection.id, not the slug: the dispositions
// API authorizes the item then asserts item.collectionId === params.id, which
// is always a ULID — a slug there 404s.

type Undo = { itemId: string; name: string | null };

interface TriageUndoContextValue {
  undo: Undo | null;
  error: string;
  setAside: (itemId: string, name: string | null) => Promise<void>;
  bringBack: () => Promise<void>;
}

const TriageUndoContext = createContext<TriageUndoContextValue | null>(null);

export function useTriageUndo(): TriageUndoContextValue {
  const ctx = useContext(TriageUndoContext);
  if (!ctx) throw new Error("useTriageUndo must be used within a TriageUndoProvider");
  return ctx;
}

// Non-throwing read of the context: returns null when no provider is mounted.
// The walkthrough renders SetAsideButton in synchronous "local" mode with no
// provider, so it needs to probe the context without the throwing guard above.
export function useOptionalTriageUndo(): TriageUndoContextValue | null {
  return useContext(TriageUndoContext);
}

export function TriageUndoProvider({
  collectionId,
  children,
}: {
  collectionId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [undo, setUndo] = useState<Undo | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function setAside(itemId: string, name: string | null) {
    if (inFlight.current) return; // a double-tap before the button disables is a no-op
    inFlight.current = true;
    setError("");
    try {
      const res = await fetch(`/api/collections/${collectionId}/dispositions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, disposition: "set_aside" }),
      });
      if (!res.ok) throw new Error("set aside failed");
      // Replace any prior undo with the item just set aside, then refresh: the
      // provider sits above the item branch, so this state rides over the next
      // item — or over the empty state when the queue empties.
      setUndo({ itemId, name });
      router.refresh();
    } catch {
      setError("That didn't go through — give it another try in a moment.");
    } finally {
      inFlight.current = false;
    }
  }

  async function bringBack() {
    if (!undo || inFlight.current) return;
    inFlight.current = true;
    setError("");
    try {
      const res = await fetch(`/api/collections/${collectionId}/dispositions/${undo.itemId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("bring back failed");
      setUndo(null);
      router.refresh(); // the item returns to the queue and resurfaces
    } catch {
      setError("That didn't go through — give it another try in a moment.");
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <TriageUndoContext.Provider value={{ undo, error, setAside, bringBack }}>
      {children}
    </TriageUndoContext.Provider>
  );
}
