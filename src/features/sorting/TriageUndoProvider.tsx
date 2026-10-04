"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import {
  enqueue,
  newClientKey,
  removeQueued,
  type PendingEntry,
  type QueueKey,
} from "./decisionQueue";
import { isInFlight, triggerFlush } from "./decisionFlusher";
import { directSubmit } from "./directSubmit";

// The set-aside undo, hoisted out of the empty-state branch. Not mine
// (TriageRound's `handleNotMine`, via `SetAsideButton`) lives inside the triage
// decision sub-row, but the NOTICE (TriageUndoNotice) renders OUTSIDE the
// `{!item ? <EmptyState/> : …}` ternary —
// so when the curator sets aside the LAST untriaged item and the item branch
// unmounts (item === null), the "Bring back" undo still shows. The durable
// "Set aside" list recovers it too, but the spec's promise is that the inline
// undo survives a refresh (§11) — including the refresh that empties the queue.
//
// Epic P (spec §3.3): dispositions ride the decision queue — setAside
// enqueues a disposition entry and triggers a flush; there is NO awaited fetch
// and NO router.refresh() on the tap path (the optimistic advance is owned by
// TriageRound; server truth reconciles at the round-end refresh). Undo of a
// still-queued set-aside is pure client (removeQueued); once the entry has
// flushed (or is inside an active request), bringBack enqueues a `clear` —
// the flusher's DELETE is idempotent. Only the storage-unavailable fallback
// (F18) still performs today's awaited direct submit.
//
// There is deliberately no auto-dismiss timer — a countdown reads as a
// deadline, and this is a gentle escape, not a race (TONE.md, commitment 4).
//
// collectionId MUST be the ULID collection.id, not the slug: the dispositions
// API authorizes the item then asserts item.collectionId === params.id, which
// is always a ULID — a slug there 404s.

// clientKey null = the fallback direct POST landed it (nothing queued to remove).
type Undo = { itemId: string; name: string | null; clientKey: string | null };

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
// TriageRound reads it this way so it still renders without a provider; Not mine
// then skips the set-aside undo.
export function useOptionalTriageUndo(): TriageUndoContextValue | null {
  return useContext(TriageUndoContext);
}

export function TriageUndoProvider({
  curatorId,
  sessionId,
  collectionId,
  children,
}: {
  curatorId: string;
  sessionId: string;
  collectionId: string;
  children: React.ReactNode;
}) {
  const key = useMemo<QueueKey>(
    () => ({ curatorId, sessionId, collectionId }),
    [curatorId, sessionId, collectionId],
  );
  const [undo, setUndo] = useState<Undo | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  function dispositionEntry(
    itemId: string,
    disposition: "set_aside" | "deferred" | "clear",
  ): PendingEntry {
    return {
      kind: "disposition",
      clientKey: newClientKey(),
      itemId,
      disposition,
      enqueuedAt: new Date().toISOString(),
    };
  }

  async function setAside(itemId: string, name: string | null) {
    if (inFlight.current) return; // a double-tap before the button disables is a no-op
    inFlight.current = true;
    setError("");
    try {
      const entry = dispositionEntry(itemId, "set_aside");
      const persisted = await enqueue(key, entry, () => triggerFlush(key));
      if (persisted === "needs_fallback") {
        // Storage unavailable even after a flush: degrade to today's awaited
        // direct submit (F18) — nothing is queued, so the undo must DELETE.
        if (!(await directSubmit({ sessionId, collectionId }, entry))) throw new Error("set aside failed");
        setUndo({ itemId, name, clientKey: null });
        return;
      }
      void triggerFlush(key);
      // Replace any prior undo with the item just set aside: the provider sits
      // above the item branch, so this state rides over the next item — or over
      // the empty state when the queue empties.
      setUndo({ itemId, name, clientKey: entry.clientKey });
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
      const { itemId, clientKey } = undo;
      // Still queued and not inside an active request → the answer never left
      // the device; removing the entry IS the undo.
      if (clientKey !== null && !isInFlight(key, clientKey) && removeQueued(key, clientKey)) {
        setUndo(null);
        return;
      }
      // Flushed or in flight: a `clear` entry rides the queue behind it; the
      // flusher's DELETE is idempotent, so ordering is safe either way.
      const clear = dispositionEntry(itemId, "clear");
      const persisted = await enqueue(key, clear, () => triggerFlush(key));
      if (persisted === "needs_fallback") {
        if (!(await directSubmit({ sessionId, collectionId }, clear))) throw new Error("bring back failed");
      } else {
        void triggerFlush(key);
      }
      setUndo(null);
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
