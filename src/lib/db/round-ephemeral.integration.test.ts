// @vitest-environment node
//
// Epic 4c load-bearing invariant: a ROUND is ephemeral client state (a start
// timestamp + a box length held in the browser), NOT a persisted entity. Starting
// or ending a round must therefore write NO session row and must never strand a
// second/paused session — the durable session container (one active/paused per
// (collection, curator), enforced by the partial sessions_active_unique index) is
// the only thing that ever touches `sessions`.
//
// The only server writes a round performs are the decision_events it records
// (triage / pairwise). This drives the REAL decisions route against ephemeral
// Postgres and asserts the session table is untouched across a whole round's worth
// of decisions — one active row before, the same one active row after, no paused
// orphan, and a fresh create still 409s (proving no slot was silently freed).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { POST as createSession } from "@/app/api/sessions/route";
import { POST as postDecision } from "@/app/api/sessions/[id]/decisions/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function sessionsReq(body: unknown): Request {
  return new Request("http://localhost/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function decisionReq(body: unknown): Request {
  return new Request("http://localhost/api/sessions/x/decisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describeDb("a round is ephemeral: it never spawns a 2nd session or strands a paused one (Epic 4c)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("keeps exactly ONE session across a whole round of decisions — no 2nd row, no paused orphan", async () => {
    const { db } = getTestDb();
    const sessionRepo = new SessionRepository(db);

    // A collection with a few items, and the curator's single active session.
    const collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Round repro', 'active', now(), now())
    `);
    const itemRepo = new ItemRepository(db);
    const items = [await itemRepo.create({ collectionId }), await itemRepo.create({ collectionId })];

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const created = await createSession(sessionsReq({ collectionId }) as any);
    expect(created.status).toBe(201);
    const session = await created.json();

    // Baseline: exactly one session row for the collection, and it's active.
    const before = await sessionRepo.findByCollection(collectionId);
    expect(before).toHaveLength(1);
    expect(before[0].status).toBe("active");

    // Run a "round": several triage decisions. The client would render the round
    // chrome + timer around these; the SERVER only sees decision writes.
    for (const item of items) {
      const res = await postDecision(
        decisionReq({ type: "triage", decision: { itemId: item.id, result: "top" } }) as any,
        { params: { id: session.id } },
      );
      expect(res.status).toBe(201);
    }

    // Ending the round is purely client-side (timer expiry / queue empty). Assert
    // the durable session container is byte-for-byte the same shape:
    const after = await sessionRepo.findByCollection(collectionId);
    expect(after).toHaveLength(1); // NO second session materialized
    expect(after[0].id).toBe(session.id); // same session
    expect(after[0].status).toBe("active"); // NOT paused/stranded by the round

    // And the decision_events the round produced really did land on THIS session.
    expect(await new DecisionEventRepository(db).findBySession(session.id)).toHaveLength(2);

    // The active slot is still held: a fresh create for the same (collection,
    // curator) still 409s — proving the round freed nothing and stranded nothing.
    const second = await createSession(sessionsReq({ collectionId }) as any);
    expect(second.status).toBe(409);
    expect(await sessionRepo.findByCollection(collectionId)).toHaveLength(1);
  });
});
