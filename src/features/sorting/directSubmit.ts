import type { PendingEntry } from "./decisionQueue";

// The storage-unavailable fallback (spec §3.1, F18): when enqueue() cannot persist even after
// a flush, the island sends this ONE entry directly and awaits it. A decision goes to the
// single-decision route (the flusher batches decisions; this never does); a disposition uses the
// flusher's routes. A network throw reads as "not landed", so each island shows its own line.
export async function directSubmit(
  route: { sessionId: string; collectionId: string },
  entry: PendingEntry,
): Promise<boolean> {
  try {
    const res =
      entry.kind === "decision"
        ? await fetch(`/api/sessions/${route.sessionId}/decisions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: entry.type, decision: entry.decision, clientKey: entry.clientKey }),
          })
        : entry.disposition === "clear"
          ? await fetch(`/api/collections/${route.collectionId}/dispositions/${entry.itemId}`, { method: "DELETE" })
          : await fetch(`/api/collections/${route.collectionId}/dispositions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ itemId: entry.itemId, disposition: entry.disposition }),
            });
    return res.ok;
  } catch {
    return false;
  }
}
