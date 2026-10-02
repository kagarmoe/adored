// @vitest-environment node
// Regression for spec §1: every "See results" tap used to create a draft. The live
// Ranking page now only reads — rendering it, pins lookup included, writes no row
// (no draft exists, and viewing must not open one).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession, requireAuth: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  permanentRedirect: (url: string) => {
    throw new Error(`NEXT_PERMANENT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import RankingPage from "@/app/collections/[id]/results/page";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("viewing the Ranking creates nothing", () => {
  let ownerId: string;
  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
  });
  afterAll(async () => {
    await closeDb();
  });

  it("renders the live ranking twice and leaves sort_results empty", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(ownerId);
    for (const [i, rankBucket] of (["top", "high", "low"] as const).entries()) {
      const item = await new ItemRepository(db).create({ collectionId, name: `Piece ${i}` });
      await new CollectionPreferenceItemRepository(db).create({ collectionId, curatorId: ownerId, itemId: item.id, score: 0.5, confidence: 1, rankBucket, comparisonCount: 1 });
    }
    const count = async () => Number(((await db.execute(sql`select count(*)::int as n from sort_results`))[0] as { n: number }).n);

    await RankingPage({ params: Promise.resolve({ id: collectionId }) });
    await RankingPage({ params: Promise.resolve({ id: collectionId }) });

    expect(await count()).toBe(0);
  });
});
