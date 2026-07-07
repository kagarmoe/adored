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

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { POST as postBatch } from "@/app/api/sessions/[id]/decisions/batch/route";

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
});
