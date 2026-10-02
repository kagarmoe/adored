// Un-mocked DB-integration proof that a disposed piece stays out of pairs. A
// `deferred`/`set_aside` piece is never triaged, so it has no preference row and
// is therefore outside the comparable set (Love + Like) — disposition itself is
// no longer on the compare path; being untriaged is what keeps it out.
//
// Real repos -> ephemeral Postgres, using the exact fetches the Sort screen runs
// (ItemController.listItems, PreferenceController.listItemPreferences,
// DecisionController.listForCurator) wired into the production selector.
// Mocks ONLY the two true boundaries: getDb (-> test db) and auth (-> curator).
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { ItemDispositionRepository } from "@/server/repositories/implementations/ItemDispositionRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { POST as postDecision } from "@/app/api/sessions/[id]/decisions/route";
import { ItemController } from "@/server/api/items";
import { PreferenceController } from "@/server/api/preferences";
import { DecisionController } from "@/server/api/decisions";
import { selectNextPair } from "@/lib/pairwise-selection";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function triageReq(sessionId: string, itemId: string, result: string): Request {
  return new Request(`http://localhost/api/sessions/${sessionId}/decisions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "triage", decision: { itemId, result } }),
  });
}

describeDb("a disposed piece is untriaged, so it is outside Love + Like and never pairs", () => {
  let curatorId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    curatorId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("a deferred item C never pairs and is absent from preferences, while A/B do pair", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(curatorId);
    const itemA = await new ItemRepository(db).create({ collectionId, name: "Bag A" });
    const itemB = await new ItemRepository(db).create({ collectionId, name: "Bag B" });
    const itemC = await new ItemRepository(db).create({ collectionId, name: "Bag C" });
    const sortSession = await new SessionRepository(db).create({ collectionId, curatorId });

    // Curator deferred item C — it must vanish from the compare candidate set.
    await new ItemDispositionRepository(db).upsert({
      collectionId,
      curatorId,
      itemId: itemC.id,
      disposition: "deferred",
    });

    // Record REAL triage decisions for A and B through the route handler, so the
    // production recalc writes their preference rows. C is never triaged.
    mockGetSession.mockResolvedValue({ user: { id: curatorId } });
    for (const id of [itemA.id, itemB.id]) {
      const res = await postDecision(
        triageReq(sortSession.id, id, "top") as any,
        { params: Promise.resolve({ id: sortSession.id }) } as any,
      );
      expect(res.status).toBe(201);
    }

    // Build the selector inputs from the EXACT fetches the Sort screen uses.
    const [items, preferences, decisions] = await Promise.all([
      ItemController.fromDb(db).listItems(collectionId),
      PreferenceController.fromDb(db).listItemPreferences(collectionId, curatorId),
      DecisionController.fromDb(db).listForCurator(collectionId, curatorId),
    ]);

    // Non-vacuous: C is absent from preferences (no events → no row); A and B are present.
    const prefItemIds = new Set(preferences.map((p) => p.itemId));
    expect(prefItemIds.has(itemC.id)).toBe(false);
    expect(prefItemIds.has(itemA.id)).toBe(true);
    expect(prefItemIds.has(itemB.id)).toBe(true);

    const pair = selectNextPair({
      preferences,
      items,
      decisions,
    });

    // Non-vacuous: a real pair IS offered, and it is exactly {A, B} — not null.
    expect(pair).not.toBeNull();
    const pairedIds = new Set([pair![0].id, pair![1].id]);
    expect(pairedIds.has(itemA.id)).toBe(true);
    expect(pairedIds.has(itemB.id)).toBe(true);
    // The disposed item C is NEVER offered: disposed <=> untriaged, so it has no
    // preference and is outside the comparable set (Love + Like).
    expect(pairedIds.has(itemC.id)).toBe(false);
  });
});
