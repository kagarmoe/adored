// src/lib/db/sort-pipeline.integration.test.ts
//
// Task 12: characterize the sort pipeline across the real DB seam (always-on
// db-tests tier). Two slices:
//   1) A triage decision recorded through the REAL decisions route persists a
//      CollectionPreferenceItem in the RIGHT bucket (persistence + bucket
//      direction only — ScoringService's unit tests own the score arithmetic).
//   2) SortResultService.createDraftResult materializes one SortResultItem per
//      preference, ranked by score.
//
// Mirrors triage-decision.integration.test.ts: describeDb / resetDb / seedBaseline,
// real repos across the seam, mocking only the two true boundaries (auth + db).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultService } from "@/server/services/SortResultService";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
// Flat-replace form: the spread form pulls in uninstalled nodemailer and errors.
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

// Route imported via the @/ alias ([id] is a real dir).
import { POST as recordDecision } from "@/app/api/sessions/[id]/decisions/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function decisionReq(body: unknown): Request {
  return new Request("http://localhost/api/sessions/x/decisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describeDb("sort pipeline (route/service -> DB)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  /** Seed a collection + one item + an active session whose curator is `curatorId`. */
  async function seedCollectionItemSession(curatorId: string) {
    const { db } = getTestDb();
    const collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Pipeline repro', 'active', now(), now())
    `);
    const item = await new ItemRepository(db).create({ collectionId });
    const session = await new SessionRepository(db).create({ collectionId, curatorId });
    return { collectionId, itemId: item.id, sessionId: session.id };
  }

  it("triage decision persists a preference in the right bucket", async () => {
    const { db } = getTestDb();
    const { collectionId, itemId, sessionId } = await seedCollectionItemSession(ownerId);

    // Record a "top" triage through the REAL route (route -> ScoringService ->
    // PreferenceStateService -> repo), crossing the seam un-mocked.
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await recordDecision(
      decisionReq({ type: "triage", decision: { itemId, result: "top" } }) as any,
      { params: { id: sessionId } },
    );
    expect(res.status).toBe(201);

    // Persisted row + bucket DIRECTION only. A "top" triage must land in the "top"
    // bucket; the exact score is ScoringService's unit-test territory, not ours.
    const pref = await new CollectionPreferenceItemRepository(db).findByItem(itemId, ownerId);
    expect(pref).not.toBeNull();
    expect(pref!.collectionId).toBe(collectionId);
    expect(pref!.rankBucket).toBe("top");
  });

  it("createDraftResult materializes one item per preference, ranked by score", async () => {
    // Characterizes the INTENDED-but-unwired service path: SortResultService is
    // orphaned (the live POST /api/sort-results route never calls it — see the
    // RED seam tripwire in sort-results-authz.integration.test.ts). This is the
    // future-repair target the live seam should eventually delegate to, NOT the
    // live-seam guard. We exercise the service directly with real repos.
    const { db } = getTestDb();
    const collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Draft result', 'active', now(), now())
    `);
    const itemRepo = new ItemRepository(db);
    const lowItem = await itemRepo.create({ collectionId });
    const highItem = await itemRepo.create({ collectionId });

    // Two preferences with distinct scores; highItem outranks lowItem.
    const prefRepo = new CollectionPreferenceItemRepository(db);
    await prefRepo.create({
      collectionId, curatorId: ownerId, itemId: lowItem.id,
      score: 0.375, confidence: 1, rankBucket: "medium", comparisonCount: 0,
    });
    await prefRepo.create({
      collectionId, curatorId: ownerId, itemId: highItem.id,
      score: 0.875, confidence: 1, rankBucket: "top", comparisonCount: 0,
    });

    const service = new SortResultService(
      new SortResultRepository(db),
      new SortResultItemRepository(db),
      prefRepo,
    );
    const result = await service.createDraftResult(collectionId, ownerId, "Draft");

    // One SortResultItem per preference...
    const items = await new SortResultItemRepository(db).findByResult(result.id);
    expect(items).toHaveLength(2);

    // ...ranked by score: highest score is computedRank 0.
    const byRank = [...items].sort((a, b) => a.computedRank - b.computedRank);
    expect(byRank[0].itemId).toBe(highItem.id);
    expect(byRank[0].computedRank).toBe(0);
    expect(byRank[1].itemId).toBe(lowItem.id);
    expect(byRank[1].computedRank).toBe(1);
  });
});
