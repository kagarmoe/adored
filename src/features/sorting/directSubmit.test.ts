import { afterEach, describe, expect, it, vi } from "vitest";
import { directSubmit } from "./directSubmit";
import type { PendingEntry } from "./decisionQueue";

const route = { sessionId: "sess_1", collectionId: "col_1" };
const at = new Date(0).toISOString();
afterEach(() => vi.unstubAllGlobals());

describe("directSubmit — the storage-unavailable fallback, one request per entry", () => {
  const cases: [string, PendingEntry, string, RequestInit][] = [
    [
      "a decision POSTs the single decisions route with its clientKey",
      { kind: "decision", clientKey: "k1", type: "triage", decision: { itemId: "i1", result: "top" }, enqueuedAt: at },
      "/api/sessions/sess_1/decisions",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "triage", decision: { itemId: "i1", result: "top" }, clientKey: "k1" }) },
    ],
    [
      "a set-aside POSTs the collection's dispositions route with the disposition",
      { kind: "disposition", clientKey: "k2", itemId: "i2", disposition: "set_aside", enqueuedAt: at },
      "/api/collections/col_1/dispositions",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: "i2", disposition: "set_aside" }) },
    ],
    [
      "clear DELETEs that item's disposition",
      { kind: "disposition", clientKey: "k3", itemId: "i3", disposition: "clear", enqueuedAt: at },
      "/api/collections/col_1/dispositions/i3",
      { method: "DELETE" },
    ],
  ];
  for (const [name, entry, url, init] of cases) {
    it(name, async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      expect(await directSubmit(route, entry)).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(url, init);
    });
  }
  it("a non-ok response and a network throw both read as not landed", async () => {
    const entry = cases[0][1];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await directSubmit(route, entry)).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await directSubmit(route, entry)).toBe(false);
  });
});
