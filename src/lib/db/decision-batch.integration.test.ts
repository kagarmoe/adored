// Real-DB integration proof for the batched decisions write path (Epic P):
//   POST /api/sessions/[id]/decisions/batch
//
// Gates are IDENTICAL to the single route (401 → 404 → membership → curator 403
// → in-progress 409), then the body is read under a stream byte budget (413 —
// App Router has no bodyParser.sizeLimit and Content-Length is absent under
// chunked transfer) and validated whole-batch with the shared Zod schema (400,
// nothing written).
//
// Mocks ONLY the true boundaries: auth (to drive the curator) and getDb.
// Un-mocked: route -> controller/repo -> pg — this file is the required
// un-mocked route→service→repo→DB seam test for the batch route.
//
// A full concurrent DB race test is NOT feasible here: the test pool is
// postgres-js with { max: 1 } (a single connection), so two transactions cannot
// be open at once to contend on the advisory lock. Same documented limitation
// as decisions-hardening.integration.test.ts.
// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { sessionsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";
import * as txMod from "@/lib/transactions";

const { mockGetSession, phCapture, phFlush } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  phCapture: vi.fn(),
  phFlush: vi.fn(),
}));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));
// Third (and last) mocked boundary: analytics — assert the capture contract
// without a network. Everything between route and pg stays real.
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: () => ({ capture: phCapture, flush: phFlush }),
}));

import { POST as postBatch } from "@/app/api/sessions/[id]/decisions/batch/route";
import { POST as postSingle } from "@/app/api/sessions/[id]/decisions/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// Client-generated idempotency key exactly as the client will mint it.
const ck = () => ulid().toLowerCase();

function batchReq(sessionId: string, body: unknown): Request {
  return new Request(`http://localhost/api/sessions/${sessionId}/decisions/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// A chunked-transfer request: ReadableStream body, NO Content-Length header —
// the shape a Content-Length check would wave through (spec F17).
function streamBatchReq(sessionId: string, totalBytes: number): Request {
  const chunk = new Uint8Array(8_192).fill(0x61); // "a"
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
      sent += chunk.byteLength;
    },
  });
  return new Request(`http://localhost/api/sessions/${sessionId}/decisions/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    // @ts-expect-error -- duplex is required by undici for stream bodies but
    // missing from the RequestInit lib type.
    duplex: "half",
  });
}

const triage = (itemId: string, result: string, clientKey = ck()) => ({
  type: "triage",
  decision: { itemId, result },
  clientKey,
});

describeDb("decisions batch route (route -> controller -> repo -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await closeDb();
  });

  // Seed one collection + n items + an active session owned by ownerId.
  async function seedSession(itemCount = 1) {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    const itemRepo = new ItemRepository(db);
    const items = [];
    for (let i = 0; i < itemCount; i++) {
      items.push(await itemRepo.create({ collectionId, name: `Bag ${i + 1}` }));
    }
    const sortSession = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
    return { db, collectionId, items, sortSession };
  }

  // ── Gates (identical to the single route, same order) ────────────────────

  it("401 unauthenticated → nothing written", async () => {
    const { db, items, sortSession } = await seedSession();
    mockGetSession.mockResolvedValue(null);

    const res = await postBatch(
      batchReq(sortSession.id, { decisions: [triage(items[0].id, "top")] }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(401);
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(0);
  });

  it("404 unknown session id → nothing written", async () => {
    const { db, items, sortSession } = await seedSession();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const unknownSessionId = generateId("session");
    const res = await postBatch(
      batchReq(unknownSessionId, { decisions: [triage(items[0].id, "top")] }) as any,
      { params: { id: unknownSessionId } } as any,
    );
    expect(res.status).toBe(404);
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(0);
  });

  it("403 for a collection MEMBER who is not the session's curator → nothing written", async () => {
    const { db, items, sortSession, collectionId } = await seedSession();
    // A second user with a real curator membership: passes the collection-access
    // gate, fails the own-session gate.
    const memberId = await seedUserRow("batch-member");
    await new MembershipRepository(db).create({ collectionId, userId: memberId, role: "curator" });
    mockGetSession.mockResolvedValue({ user: { id: memberId } });

    const res = await postBatch(
      batchReq(sortSession.id, { decisions: [triage(items[0].id, "top")] }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(403);
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(0);
  });

  it("409 on a completed (terminal) session → nothing written", async () => {
    const { db, items, sortSession } = await seedSession();
    await db
      .update(sessionsTable)
      .set({ status: "completed" })
      .where(eq(sessionsTable.id, sortSession.id));
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await postBatch(
      batchReq(sortSession.id, { decisions: [triage(items[0].id, "top")] }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(409);
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(0);
  });

  // ── Whole-batch shape validation ──────────────────────────────────────────

  it("shape-invalid bodies (bad enum / missing clientKey / bare-ULID itemId) → 400, nothing written", async () => {
    const { db, items, sortSession } = await seedSession();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const badBodies: unknown[] = [
      // out-of-enum triage result
      { decisions: [{ type: "triage", decision: { itemId: items[0].id, result: "nope" }, clientKey: ck() }] },
      // missing clientKey
      { decisions: [{ type: "triage", decision: { itemId: items[0].id, result: "top" } }] },
      // bare 26-char ULID itemId (no `item_` prefix) — must be rejected (F1)
      { decisions: [{ type: "triage", decision: { itemId: ulid().toLowerCase(), result: "top" }, clientKey: ck() }] },
    ];
    for (const body of badBodies) {
      const res = await postBatch(
        batchReq(sortSession.id, body) as any,
        { params: { id: sortSession.id } } as any,
      );
      expect(res.status).toBe(400);
    }
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(0);
  });

  it("51 entries → whole-batch 400, nothing written", async () => {
    const { db, items, sortSession } = await seedSession();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const decisions = Array.from({ length: 51 }, () => triage(items[0].id, "top"));
    const res = await postBatch(
      batchReq(sortSession.id, { decisions }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(400);
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(0);
  });

  // ── Stream-enforced body cap (F17) ────────────────────────────────────────

  it("413 for a >64 KiB ReadableStream body with NO Content-Length, nothing written", async () => {
    const { db, sortSession } = await seedSession();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await postBatch(
      streamBatchReq(sortSession.id, 70_000) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(413);
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(0);
  });

  // ── Happy path: the un-mocked route→service→repo→DB seam ─────────────────

  it("valid 3-entry triage batch → 201, per-entry created, rows persisted, recompute ran", async () => {
    const { db, collectionId, items, sortSession } = await seedSession(3);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const keys = [ck(), ck(), ck()];
    const res = await postBatch(
      batchReq(sortSession.id, {
        decisions: [
          triage(items[0].id, "top", keys[0]),
          triage(items[1].id, "high", keys[1]),
          triage(items[2].id, "medium", keys[2]),
        ],
      }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.results).toEqual(keys.map((clientKey) => ({ clientKey, status: "created" })));

    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(3);

    // Preferences exist for all 3 items — the single recompute ran inside the tx.
    const prefs = await new CollectionPreferenceItemRepository(db).findByCollection(
      collectionId,
      ownerId,
    );
    expect(prefs.map((p) => p.itemId).sort()).toEqual(items.map((i) => i.id).sort());
  });

  // ══ Task 5: transaction semantics (spec §2.3 steps 1–7) ═══════════════════

  // The recompute observable: every recompute rewrites the curator's
  // preferences rows (clearOrderRanks + bulkUpsert both stamp updatedAt), so a
  // byte-identical snapshot proves ZERO recomputes ran — no mock spy needed.
  async function prefsSnapshot(db: unknown, collectionId: string, curatorId: string) {
    const rows = await new CollectionPreferenceItemRepository(db as any).findByCollection(
      collectionId,
      curatorId,
    );
    return JSON.stringify(
      rows
        .map((r) => ({ id: r.id, itemId: r.itemId, rankBucket: r.rankBucket, updatedAt: r.updatedAt }))
        .sort((a, b) => (a.itemId < b.itemId ? -1 : 1)),
    );
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("F2 in-batch dedupe: two entries with the same clientKey → 201, created then duplicate, exactly one row", async () => {
    const { db, items, sortSession } = await seedSession();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const key = ck();
    const res = await postBatch(
      batchReq(sortSession.id, {
        decisions: [triage(items[0].id, "high", key), triage(items[0].id, "top", key)],
      }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(201); // never a 500 from the unique index
    const body = await res.json();
    expect(body.results).toEqual([
      { clientKey: key, status: "created" },
      { clientKey: key, status: "duplicate" },
    ]);
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(1);
  });

  it("F2+F13 committed-batch replay → 200, all duplicate, zero rows, ZERO recomputes, no disposition-clear; a fresh entry advances the observable", async () => {
    const { db, collectionId, items, sortSession } = await seedSession(4);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Pre-seed a disposition on an UNRELATED item — a replay must not clear it.
    const unrelated = items[3];
    await new ItemDispositionRepository(db).upsert({
      collectionId,
      curatorId: ownerId,
      itemId: unrelated.id,
      disposition: "deferred",
    });

    const decisions = [
      triage(items[0].id, "top"),
      triage(items[1].id, "high"),
      triage(items[2].id, "low"),
    ];
    const first = await postBatch(
      batchReq(sortSession.id, { decisions }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(first.status).toBe(201);
    const snapshot = await prefsSnapshot(db, collectionId, ownerId);

    // Replay the IDENTICAL batch (the recovery gate re-POSTing a batch whose
    // ack was lost after commit). Sleep so a spurious recompute's JS-clock
    // updatedAt could not collide with the original's millisecond.
    await sleep(5);
    const replay = await postBatch(
      batchReq(sortSession.id, { decisions }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(replay.status).toBe(200);
    const replayBody = await replay.json();
    expect(replayBody.results.map((r: { status: string }) => r.status)).toEqual([
      "duplicate",
      "duplicate",
      "duplicate",
    ]);
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(3);
    // Byte-identical preference rows: zero recomputes ran.
    expect(await prefsSnapshot(db, collectionId, ownerId)).toBe(snapshot);
    // The unrelated disposition is untouched: no disposition-clear ran.
    expect(
      await new ItemDispositionRepository(db).findByItem(unrelated.id, ownerId),
    ).not.toBeNull();

    // A batch with ≥1 fresh entry → 201 and the observable advances.
    await sleep(5);
    const mixed = await postBatch(
      batchReq(sortSession.id, {
        decisions: [decisions[0], triage(items[3].id, "medium")],
      }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(mixed.status).toBe(201);
    const mixedBody = await mixed.json();
    expect(mixedBody.results.map((r: { status: string }) => r.status)).toEqual([
      "duplicate",
      "created",
    ]);
    expect(await prefsSnapshot(db, collectionId, ownerId)).not.toBe(snapshot);
  });

  it("semantic rejection: unknown/foreign items → rejected(unknown_item); valid entry created; rejected itemId's disposition survives", async () => {
    const { db, collectionId, items, sortSession } = await seedSession();
    // A second collection with its own item — same curator, foreign to the batch's collection.
    const foreignCollectionId = await seedBareCollection(ownerId);
    const foreignItem = await new ItemRepository(db).create({
      collectionId: foreignCollectionId,
      name: "Foreign bag",
    });
    // Pre-seed a disposition on the soon-to-be-rejected item: rejected entries
    // must trigger NO disposition-clear.
    await new ItemDispositionRepository(db).upsert({
      collectionId: foreignCollectionId,
      curatorId: ownerId,
      itemId: foreignItem.id,
      disposition: "set_aside",
    });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const keys = [ck(), ck(), ck()];
    const res = await postBatch(
      batchReq(sortSession.id, {
        decisions: [
          triage(items[0].id, "top", keys[0]),
          triage(foreignItem.id, "high", keys[1]),
          {
            type: "pairwise_compare",
            decision: { itemAId: items[0].id, itemBId: generateId("item"), result: "item_a" },
            clientKey: keys[2],
          },
        ],
      }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.results).toEqual([
      { clientKey: keys[0], status: "created" },
      { clientKey: keys[1], status: "rejected", reason: "unknown_item" },
      { clientKey: keys[2], status: "rejected", reason: "unknown_item" },
    ]);
    // Only the valid row was written.
    const events = await new DecisionEventRepository(db).findBySession(sortSession.id);
    expect(events).toHaveLength(1);
    // The rejected item's disposition survives.
    expect(
      await new ItemDispositionRepository(db).findByItem(foreignItem.id, ownerId),
    ).not.toBeNull();

    // An ALL-rejected batch → 200 and the recompute observable is unchanged.
    const snapshot = await prefsSnapshot(db, collectionId, ownerId);
    await sleep(5);
    const allRejected = await postBatch(
      batchReq(sortSession.id, { decisions: [triage(foreignItem.id, "top")] }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(allRejected.status).toBe(200);
    expect(await prefsSnapshot(db, collectionId, ownerId)).toBe(snapshot);
  });

  it("F3 cross-path latest-wins: single→batch resolves to the batch's result, batch→single to the single's", async () => {
    const { db, collectionId, items, sortSession } = await seedSession(2);
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const prefRepo = new CollectionPreferenceItemRepository(db);
    const singleReq = (itemId: string, result: string) =>
      new Request(`http://localhost/api/sessions/${sortSession.id}/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "triage", decision: { itemId, result }, clientKey: ck() }),
      });

    // Single route then batch route → the batch's result wins.
    const itemA = items[0];
    expect(
      (
        await postSingle(singleReq(itemA.id, "low") as any, {
          params: { id: sortSession.id },
        } as any)
      ).status,
    ).toBe(201);
    expect(
      (
        await postBatch(
          batchReq(sortSession.id, { decisions: [triage(itemA.id, "top")] }) as any,
          { params: { id: sortSession.id } } as any,
        )
      ).status,
    ).toBe(201);
    let prefs = await prefRepo.findByCollection(collectionId, ownerId);
    expect(prefs.find((p) => p.itemId === itemA.id)?.rankBucket).toBe("top");

    // Batch route then single route → the single's result wins. Both paths
    // omit createdAt, so DB now() is the one shared clock domain.
    const itemB = items[1];
    expect(
      (
        await postBatch(
          batchReq(sortSession.id, { decisions: [triage(itemB.id, "high")] }) as any,
          { params: { id: sortSession.id } } as any,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await postSingle(singleReq(itemB.id, "medium") as any, {
          params: { id: sortSession.id },
        } as any)
      ).status,
    ).toBe(201);
    prefs = await prefRepo.findByCollection(collectionId, ownerId);
    expect(prefs.find((p) => p.itemId === itemB.id)?.rankBucket).toBe("medium");
  });

  it("shared batch timestamp: same item high→top in one batch → one createdAt, recompute resolves to the later entry", async () => {
    const { db, collectionId, items, sortSession } = await seedSession();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await postBatch(
      batchReq(sortSession.id, {
        decisions: [triage(items[0].id, "high"), triage(items[0].id, "top")],
      }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(201);

    const events = await new DecisionEventRepository(db).findBySession(sortSession.id);
    expect(events).toHaveLength(2);
    // Postgres now() is transaction-start-fixed: both rows share ONE timestamp.
    expect(events[0].createdAt.getTime()).toBe(events[1].createdAt.getTime());
    // The later array entry wins via the monotonic-id tie-break.
    const prefs = await new CollectionPreferenceItemRepository(db).findByCollection(
      collectionId,
      ownerId,
    );
    expect(prefs.find((p) => p.itemId === items[0].id)?.rankBucket).toBe("top");
  });

  it("clientKey scope pinned: the same clientKey in two different sessions → created in both (index is per-session)", async () => {
    const { db, items, sortSession } = await seedSession();
    // Second in-progress session must live on a SECOND collection — the partial
    // unique index allows only one active session per (collection, curator).
    const otherCollectionId = await seedBareCollection(ownerId);
    const otherItem = await new ItemRepository(db).create({
      collectionId: otherCollectionId,
      name: "Other bag",
    });
    const otherSession = await new SessionRepository(db).create({
      collectionId: otherCollectionId,
      curatorId: ownerId,
    });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const sharedKey = ck();
    const first = await postBatch(
      batchReq(sortSession.id, { decisions: [triage(items[0].id, "top", sharedKey)] }) as any,
      { params: { id: sortSession.id } } as any,
    );
    const second = await postBatch(
      batchReq(otherSession.id, { decisions: [triage(otherItem.id, "top", sharedKey)] }) as any,
      { params: { id: otherSession.id } } as any,
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((await first.json()).results[0].status).toBe("created");
    expect((await second.json()).results[0].status).toBe("created");
    expect(await new DecisionEventRepository(db).findBySession(sortSession.id)).toHaveLength(1);
    expect(await new DecisionEventRepository(db).findBySession(otherSession.id)).toHaveLength(1);
  });

  it("advisory lock: the batch path takes the (collection,curator) lock inside its tx", async () => {
    const { collectionId, items, sortSession } = await seedSession();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Spy WITHOUT replacing the impl — the real lock still runs against pg.
    // (A true two-connection race is not feasible on the { max: 1 } test pool —
    // same documented limitation as decisions-hardening.)
    const lockSpy = vi.spyOn(txMod, "lockCollectionCurator");

    const res = await postBatch(
      batchReq(sortSession.id, { decisions: [triage(items[0].id, "top")] }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(res.status).toBe(201);
    expect(lockSpy).toHaveBeenCalledWith(expect.anything(), collectionId, ownerId);
  });

  it("F15 analytics: exactly one sort_decision_batch_recorded per request, counts match the response, flush awaited; replay emits {0,n,0}", async () => {
    const { db, items, sortSession } = await seedSession(2);
    const foreignCollectionId = await seedBareCollection(ownerId);
    const foreignItem = await new ItemRepository(db).create({
      collectionId: foreignCollectionId,
      name: "Foreign bag",
    });
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Seed one committed key so the mixed batch has a genuine duplicate.
    const dupKey = ck();
    await postBatch(
      batchReq(sortSession.id, { decisions: [triage(items[0].id, "top", dupKey)] }) as any,
      { params: { id: sortSession.id } } as any,
    );
    phCapture.mockClear();
    phFlush.mockClear();

    // Mixed batch: 1 created + 1 duplicate + 1 rejected.
    const mixed = await postBatch(
      batchReq(sortSession.id, {
        decisions: [
          triage(items[1].id, "high"),
          triage(items[0].id, "top", dupKey),
          triage(foreignItem.id, "low"),
        ],
      }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(mixed.status).toBe(201);
    const mixedBody = await mixed.json();
    const tally = (status: string) =>
      mixedBody.results.filter((r: { status: string }) => r.status === status).length;

    expect(phCapture).toHaveBeenCalledTimes(1);
    const captured = phCapture.mock.calls[0][0];
    expect(captured.event).toBe("sort_decision_batch_recorded");
    expect(captured.properties).toEqual({
      created: tally("created"),
      duplicate: tally("duplicate"),
      rejected: tally("rejected"),
    });
    expect(captured.properties).toEqual({ created: 1, duplicate: 1, rejected: 1 });
    // flush() delivered after the capture (serverless can freeze on return).
    expect(phFlush).toHaveBeenCalledTimes(1);
    expect(phFlush.mock.invocationCallOrder[0]).toBeGreaterThan(
      phCapture.mock.invocationCallOrder[0],
    );

    // Replay of an all-committed batch → still ONE capture, counts {0, n, 0}
    // (capture fires per request — replay frequency IS the recovery signal).
    phCapture.mockClear();
    const replay = await postBatch(
      batchReq(sortSession.id, { decisions: [triage(items[0].id, "top", dupKey)] }) as any,
      { params: { id: sortSession.id } } as any,
    );
    expect(replay.status).toBe(200);
    expect(phCapture).toHaveBeenCalledTimes(1);
    expect(phCapture.mock.calls[0][0].properties).toEqual({
      created: 0,
      duplicate: 1,
      rejected: 0,
    });
  });
});
